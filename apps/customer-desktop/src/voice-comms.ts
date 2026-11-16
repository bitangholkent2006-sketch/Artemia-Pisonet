/**
 * Artemia's Pisonet - Local LAN Squad Voice Comms & Shop Intercom
 * 100% Offline, Zero Discord / Zero Website, Sub-Millisecond Web Audio Streaming
 */

export interface VoiceMember {
  pcId: string;
  pcName: string;
  isMuted: boolean;
  isDeafened: boolean;
  isTalking: boolean;
}

export interface VoiceRoom {
  id: string;
  name: string;
  description: string;
  maxSlots: number;
  memberCount: number;
  members: VoiceMember[];
}

export const DEFAULT_CLIENT_VOICE_ROOMS: VoiceRoom[] = [
  { id: 'lobby', name: '🔊 Shop Lobby', description: 'General All-PC Chat', maxSlots: 20, memberCount: 0, members: [] },
  { id: 'squad-1', name: '⚔️ Squad 1 (Team Alpha)', description: 'Party / Competitive Match', maxSlots: 5, memberCount: 0, members: [] },
  { id: 'squad-2', name: '🔥 Squad 2 (Team Bravo)', description: 'Party / Competitive Match', maxSlots: 5, memberCount: 0, members: [] },
  { id: 'squad-3', name: '⚡ Squad 3 (Team Charlie)', description: 'Party / Casual Match', maxSlots: 5, memberCount: 0, members: [] },
  { id: 'duo-1', name: '👥 Duo Room 1', description: '2-Player Private Duo', maxSlots: 2, memberCount: 0, members: [] },
  { id: 'duo-2', name: '👥 Duo Room 2', description: '2-Player Private Duo', maxSlots: 2, memberCount: 0, members: [] }
];

export class VoiceCommsService {
  private socket: any = null;
  private pcId: string = '';
  private pcName: string = '';

  // Audio Contexts
  private captureCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private playbackCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private nextPlaybackTime: number = 0;

  // Active State
  public currentRoomId: string | null = null;
  public currentRoomName: string = '';
  public isMuted: boolean = false;
  public isDeafened: boolean = false;
  public voiceMode: 'vad' | 'ptt' = 'vad';
  public isPttPressed: boolean = false;
  public vadThreshold: number = 0.015; // Voice Activity Detection Threshold
  public volume: number = 0.85; // 0 to 1.0

  public rooms: VoiceRoom[] = [...DEFAULT_CLIENT_VOICE_ROOMS];
  public members: VoiceMember[] = [];
  public speakingMembers: Set<string> = new Set();
  private speakingTimeouts: Map<string, any> = new Map();
  private lastSelfTalkingState: boolean = false;
  private selfTalkingDebounceTimer: any = null;

  // Callbacks for UI updates
  public onStateChange?: () => void;
  public onIntercomAlert?: (info: { from: string; isBroadcast: boolean }) => void;

  constructor() {}

  public init(socket: any, pcId: string, pcName: string) {
    this.socket = socket;
    this.pcId = pcId;
    this.pcName = pcName;

    this.setupSocketListeners();
    this.setupPttKeyListeners();

    // Fetch initial voice rooms
    if (this.socket?.connected) {
      this.socket.emit('voice:get-rooms');
    }
  }

  public updateStationIdentity(pcId: string, pcName: string) {
    this.pcId = pcId;
    this.pcName = pcName;
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('voice:rooms-status', (payload: { rooms: VoiceRoom[] }) => {
      this.rooms = payload.rooms || [];
      if (this.currentRoomId) {
        const found = this.rooms.find(r => r.id === this.currentRoomId);
        if (found) {
          this.members = found.members || [];
        }
      }
      this.onStateChange?.();
    });

    this.socket.on('voice:members-updated', (payload: { roomId: string; members: VoiceMember[] }) => {
      if (this.currentRoomId === payload.roomId) {
        this.members = payload.members || [];
        this.onStateChange?.();
      }
    });

    this.socket.on('voice:member-state', (payload: { roomId: string; pcId: string; isMuted?: boolean; isDeafened?: boolean; isTalking?: boolean }) => {
      if (this.currentRoomId !== payload.roomId) return;
      const mem = this.members.find(m => m.pcId === payload.pcId);
      if (mem) {
        if (payload.isMuted !== undefined) mem.isMuted = payload.isMuted;
        if (payload.isDeafened !== undefined) mem.isDeafened = payload.isDeafened;
        if (payload.isTalking !== undefined) mem.isTalking = payload.isTalking;
      }
      if (payload.isTalking) {
        this.setMemberSpeaking(payload.pcId);
      }
      this.onStateChange?.();
    });

    // Incoming voice chunk from squad mate
    this.socket.on('voice:audio-chunk', (payload: { roomId: string; pcId: string; pcName: string; data: any }) => {
      if (!this.currentRoomId || this.currentRoomId !== payload.roomId) return;
      if (payload.pcId === this.pcId) return; // Don't playback own voice
      if (this.isDeafened) return;

      this.playIncomingChunk(payload.pcId, payload.data);
    });

    // Incoming Shop Intercom / PA Broadcast from Admin Operator
    this.socket.on('voice:intercom-audio', (payload: { from: string; data: any; isBroadcast: boolean }) => {
      this.playIntercomAudio(payload.from, payload.data, payload.isBroadcast);
    });
  }

  private setupPttKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Do not trigger PTT if typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      // PTT Key is 'v' or 'V' by default
      if (this.currentRoomId && this.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.isPttPressed = true;
        this.notifySelfTalking(true);
        this.onStateChange?.();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.currentRoomId && this.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.isPttPressed = false;
        this.notifySelfTalking(false);
        this.onStateChange?.();
      }
    });
  }

  // Ensure Playback AudioContext is alive and unblocked
  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackCtx = new AudioCtxClass();
      this.masterGain = this.playbackCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);
      this.masterGain.connect(this.playbackCtx.destination);
      this.nextPlaybackTime = this.playbackCtx.currentTime;
    }
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }
    return this.playbackCtx;
  }

  // Play audio chunk received from peer
  private playIncomingChunk(pcId: string, chunkData: any) {
    try {
      const ctx = this.ensurePlaybackContext();
      let int16Array: Int16Array;

      if (chunkData instanceof ArrayBuffer) {
        int16Array = new Int16Array(chunkData);
      } else if (ArrayBuffer.isView(chunkData)) {
        int16Array = new Int16Array(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength / 2);
      } else if (Array.isArray(chunkData)) {
        int16Array = new Int16Array(chunkData);
      } else if (typeof chunkData === 'string') {
        // Base64 decode fallback
        const binary = atob(chunkData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        int16Array = new Int16Array(bytes.buffer);
      } else {
        return;
      }

      if (int16Array.length === 0) return;

      const float32 = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32[i] = int16Array[i] / 32768.0;
      }

      const audioBuf = ctx.createBuffer(1, float32.length, 16000);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      if (this.masterGain) {
        src.connect(this.masterGain);
      } else {
        src.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlaybackTime);
      src.start(startTime);
      this.nextPlaybackTime = startTime + audioBuf.duration;

      this.setMemberSpeaking(pcId);
    } catch (err) {
      console.warn('[VoiceComms] Playback error:', err);
    }
  }

  // Play Admin Intercom with Attention Chime
  private playIntercomAudio(from: string, chunkData: any, isBroadcast: boolean) {
    try {
      const ctx = this.ensurePlaybackContext();
      this.onIntercomAlert?.({ from, isBroadcast });

      // Play short attention chime first if this is the start of an intercom alert
      this.playChime(ctx);

      let int16Array: Int16Array;
      if (chunkData instanceof ArrayBuffer) {
        int16Array = new Int16Array(chunkData);
      } else if (Array.isArray(chunkData)) {
        int16Array = new Int16Array(chunkData);
      } else {
        return;
      }

      const float32 = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32[i] = int16Array[i] / 32768.0;
      }

      const audioBuf = ctx.createBuffer(1, float32.length, 16000);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;

      // Intercom plays slightly louder for clear shop instructions
      const intercomGain = ctx.createGain();
      intercomGain.gain.setValueAtTime(Math.min(1.0, this.volume * 1.3), ctx.currentTime);
      src.connect(intercomGain);
      intercomGain.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlaybackTime);
      src.start(startTime);
      this.nextPlaybackTime = startTime + audioBuf.duration;
    } catch (err) {
      console.warn('[VoiceComms] Intercom audio playback error:', err);
    }
  }

  // Pleasant double-tone Attention Chime (880Hz -> 1320Hz)
  private playChime(ctx: AudioContext) {
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  // Start Capturing Local Microphone
  private async startCapturing(): Promise<boolean> {
    try {
      if (this.captureCtx && this.micStream) {
        if (this.captureCtx.state === 'suspended') {
          await this.captureCtx.resume();
        }
        return true;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.captureCtx = new AudioCtxClass();
      this.micSource = this.captureCtx.createMediaStreamSource(this.micStream);

      // ScriptProcessor with 2048 buffer size (~43ms slices at 48kHz)
      this.scriptProcessor = this.captureCtx.createScriptProcessor(2048, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.currentRoomId || this.isMuted || this.isDeafened) {
          if (this.lastSelfTalkingState) this.notifySelfTalking(false);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const inputSampleRate = e.inputBuffer.sampleRate;

        // Calculate Root-Mean-Square (RMS) for Voice Activity Detection
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const isVoiceActive = rms > this.vadThreshold;

        // Determine if we should transmit audio
        const shouldTransmit = this.voiceMode === 'ptt' ? this.isPttPressed : isVoiceActive;

        if (shouldTransmit) {
          this.notifySelfTalking(true);

          // Downsample to 16,000 Hz Int16 PCM (Crystal clear voice, ultra-lightweight bandwidth)
          const int16Array = this.downsampleToInt16(inputData, inputSampleRate, 16000);

          if (this.socket?.connected && int16Array.length > 0) {
            this.socket.emit('voice:audio-chunk', {
              roomId: this.currentRoomId,
              pcId: this.pcId,
              pcName: this.pcName,
              data: int16Array.buffer
            });
          }
        } else {
          this.notifySelfTalking(false);
        }
      };

      this.micSource.connect(this.scriptProcessor);
      // Connect to a silent dummy gain node so the audio processor keeps running without local echo
      const silentGain = this.captureCtx.createGain();
      silentGain.gain.value = 0;
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.captureCtx.destination);

      return true;
    } catch (err) {
      console.error('[VoiceComms] Failed to initialize microphone capture:', err);
      return false;
    }
  }

  // Downsample to 16kHz Int16 Mono PCM
  private downsampleToInt16(input: Float32Array, inputRate: number, targetRate: number = 16000): Int16Array {
    if (inputRate === targetRate) {
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return output;
    }

    const ratio = inputRate / targetRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.min(input.length - 1, Math.round(i * ratio));
      const s = Math.max(-1, Math.min(1, input[idx]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
  }

  // Notify Room that this station is talking (for visual speaking indicator)
  private notifySelfTalking(isTalking: boolean) {
    if (this.selfTalkingDebounceTimer) {
      clearTimeout(this.selfTalkingDebounceTimer);
      this.selfTalkingDebounceTimer = null;
    }

    if (isTalking) {
      if (!this.lastSelfTalkingState) {
        this.lastSelfTalkingState = true;
        this.setMemberSpeaking(this.pcId);
        this.socket?.emit('voice:member-state', {
          roomId: this.currentRoomId,
          pcId: this.pcId,
          isTalking: true
        });
        this.onStateChange?.();
      }
    } else {
      // Small debounce before turning off speaking indicator to avoid rapid blinking
      this.selfTalkingDebounceTimer = setTimeout(() => {
        if (this.lastSelfTalkingState) {
          this.lastSelfTalkingState = false;
          this.speakingMembers.delete(this.pcId);
          this.socket?.emit('voice:member-state', {
            roomId: this.currentRoomId,
            pcId: this.pcId,
            isTalking: false
          });
          this.onStateChange?.();
        }
      }, 250);
    }
  }

  // Set visual speaking indicator for a player
  private setMemberSpeaking(pcId: string) {
    this.speakingMembers.add(pcId);
    if (this.speakingTimeouts.has(pcId)) {
      clearTimeout(this.speakingTimeouts.get(pcId));
    }
    const timer = setTimeout(() => {
      this.speakingMembers.delete(pcId);
      this.speakingTimeouts.delete(pcId);
      this.onStateChange?.();
    }, 280);
    this.speakingTimeouts.set(pcId, timer);
    this.onStateChange?.();
  }

  // -------------------------------------------------------------
  // USER ACTIONS: Join, Leave, Mute, Deafen, Volume
  // -------------------------------------------------------------
  public async joinRoom(roomId: string): Promise<boolean> {
    const success = await this.startCapturing();
    if (!success) {
      console.warn('[VoiceComms] Microphone capture failed, but joining room in listen-only mode.');
    }
    this.ensurePlaybackContext();

    this.currentRoomId = roomId;
    const room = this.rooms.find(r => r.id === roomId);
    this.currentRoomName = room ? room.name : roomId.toUpperCase();

    this.socket?.emit('voice:join', {
      roomId,
      pcId: this.pcId,
      pcName: this.pcName,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened
    });

    this.onStateChange?.();
    return true;
  }

  public leaveRoom() {
    if (!this.currentRoomId) return;
    this.socket?.emit('voice:leave', { roomId: this.currentRoomId });
    this.currentRoomId = null;
    this.currentRoomName = '';
    this.members = [];
    this.speakingMembers.clear();
    this.lastSelfTalkingState = false;
    this.onStateChange?.();
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.notifySelfTalking(false);
    }
    this.socket?.emit('voice:member-state', {
      roomId: this.currentRoomId,
      pcId: this.pcId,
      isMuted: this.isMuted
    });
    this.onStateChange?.();
  }

  public toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    // Deafening automatically mutes microphone as well (standard gaming behavior)
    if (this.isDeafened && !this.isMuted) {
      this.isMuted = true;
    }
    this.socket?.emit('voice:member-state', {
      roomId: this.currentRoomId,
      pcId: this.pcId,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened
    });
    this.onStateChange?.();
  }

  public setVoiceMode(mode: 'vad' | 'ptt') {
    this.voiceMode = mode;
    this.isPttPressed = false;
    this.onStateChange?.();
  }

  public setPttState(isDown: boolean) {
    if (this.voiceMode !== 'ptt') return;
    this.isPttPressed = isDown;
    this.notifySelfTalking(isDown);
    this.onStateChange?.();
  }

  public setVolume(volPct: number) {
    this.volume = Math.max(0, Math.min(1.0, volPct / 100));
    if (this.masterGain && this.playbackCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);
    }
    this.onStateChange?.();
  }

  public setVadThreshold(val: number) {
    this.vadThreshold = val;
  }

  public destroy() {
    this.leaveRoom();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.captureCtx && this.captureCtx.state !== 'closed') {
      this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }
    if (this.playbackCtx && this.playbackCtx.state !== 'closed') {
      this.playbackCtx.close().catch(() => {});
      this.playbackCtx = null;
    }
  }
}
