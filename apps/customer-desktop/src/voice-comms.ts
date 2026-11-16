/**
 * Artemia's Pisonet - Local LAN Squad Voice Comms & Shop Intercom
 * 100% Offline, Zero Discord / Zero Website, Studio-Grade 24kHz HD Voice Streaming
 * Anti-aliased DSP Resampling, Soft-Knee Saturation Limiter, Per-Speaker Jitter Buffer
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

export const VOICE_TARGET_SAMPLE_RATE = 24000; // Studio HD Voice (24,000 Hz mono Int16 PCM)

/**
 * Soft-knee limiter preventing digital hard clipping (which causes harsh raspy 'karat' sound)
 */
export function softLimitSample(s: number): number {
  if (s > 0.95) return 0.95 + 0.05 * Math.tanh((s - 0.95) / 0.05);
  if (s < -0.95) return -0.95 + 0.05 * Math.tanh((s + 0.95) / 0.05);
  return s;
}

/**
 * Anti-aliased Resampling Algorithm:
 * - Downsampling: Area-weighted fractional integration filter (prevents high-frequency aliasing buzzing)
 * - Upsampling: Linear interpolation
 */
export function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number = VOICE_TARGET_SAMPLE_RATE
): Float32Array {
  if (inputRate === targetRate || input.length === 0) {
    const copy = new Float32Array(input.length);
    copy.set(input);
    return copy;
  }

  const ratio = inputRate / targetRate;
  const targetLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(targetLength);

  if (ratio > 1) {
    // Area-weighted anti-aliasing box integration
    for (let i = 0; i < targetLength; i++) {
      const srcStart = i * ratio;
      const srcEnd = (i + 1) * ratio;
      const startIdx = Math.floor(srcStart);
      const endIdx = Math.min(input.length, Math.ceil(srcEnd));
      let sum = 0;
      let totalWeight = 0;

      for (let j = startIdx; j < endIdx; j++) {
        const w = Math.min(j + 1, srcEnd) - Math.max(j, srcStart);
        if (w > 0) {
          sum += input[j] * w;
          totalWeight += w;
        }
      }
      output[i] = totalWeight > 0 ? (sum / totalWeight) : input[Math.min(input.length - 1, Math.floor(srcStart))];
    }
  } else {
    // Linear interpolation upsampling
    for (let i = 0; i < targetLength; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const s0 = input[idx];
      const s1 = idx + 1 < input.length ? input[idx + 1] : s0;
      output[i] = s0 + (s1 - s0) * frac;
    }
  }

  return output;
}

/**
 * Soft boundary Hanning ramp to eliminate chunk boundary pops/clicks
 */
export function applySoftBoundaryRamp(samples: Float32Array, rampSize: number = 24) {
  const len = samples.length;
  const actualRamp = Math.min(rampSize, Math.floor(len / 4));
  for (let i = 0; i < actualRamp; i++) {
    const factor = 0.5 * (1 - Math.cos((Math.PI * i) / actualRamp));
    samples[i] *= factor;
    samples[len - 1 - i] *= factor;
  }
}

export class VoiceCommsService {
  private socket: any = null;
  private pcId: string = '';
  private pcName: string = '';
  private isListenersSetup: boolean = false;

  // Audio Contexts
  private captureCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private playbackCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private speakerPlaybackTimes: Map<string, number> = new Map();
  private intercomPlaybackTime: number = 0;

  // Active State
  public currentRoomId: string | null = null;
  public currentRoomName: string = '';
  public isMuted: boolean = false;
  public isDeafened: boolean = false;
  public voiceMode: 'vad' | 'ptt' = 'vad';
  public isPttPressed: boolean = false;
  public vadThreshold: number = 0.012; // Sensitive yet clean Voice Activity Detection
  public volume: number = 0.90; // 0 to 1.0

  public rooms: VoiceRoom[] = [...DEFAULT_CLIENT_VOICE_ROOMS];
  public members: VoiceMember[] = [];
  public speakingMembers: Set<string> = new Set();
  private speakingTimeouts: Map<string, any> = new Map();
  private lastSelfTalkingState: boolean = false;
  private selfTalkingDebounceTimer: any = null;
  private vadHangTimer: any = null;
  private isVadHangActive: boolean = false;

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

    // If already in a room and reconnected, re-join immediately
    if (this.currentRoomId && this.socket?.connected) {
      this.socket.emit('voice:join', {
        roomId: this.currentRoomId,
        pcId: this.pcId,
        pcName: this.pcName,
        isMuted: this.isMuted,
        isDeafened: this.isDeafened
      });
    }

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
    if (!this.socket || this.isListenersSetup) return;
    this.isListenersSetup = true;

    this.socket.on('connect', () => {
      // Re-join active room seamlessly on reconnect
      if (this.currentRoomId) {
        this.socket.emit('voice:join', {
          roomId: this.currentRoomId,
          pcId: this.pcId,
          pcName: this.pcName,
          isMuted: this.isMuted,
          isDeafened: this.isDeafened
        });
      }
      this.socket.emit('voice:get-rooms');
      if (this.captureCtx && this.captureCtx.state === 'suspended') {
        this.captureCtx.resume().catch(() => {});
      }
      if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
        this.playbackCtx.resume().catch(() => {});
      }
    });

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

  // Ensure Playback AudioContext is alive, unblocked, and has master limiter compressor
  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackCtx = new AudioCtxClass();

      // Master Gain
      this.masterGain = this.playbackCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);

      // Studio-grade Dynamics Compressor (Prevents loudness spikes and DAC digital clipping)
      this.masterCompressor = this.playbackCtx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-14, this.playbackCtx.currentTime);
      this.masterCompressor.knee.setValueAtTime(10, this.playbackCtx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(6, this.playbackCtx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.playbackCtx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.12, this.playbackCtx.currentTime);

      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.playbackCtx.destination);
      this.speakerPlaybackTimes.clear();
      this.intercomPlaybackTime = this.playbackCtx.currentTime;
    }
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }
    return this.playbackCtx;
  }

  // Play audio chunk received from peer with independent per-speaker jitter queue
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

      // Smooth chunk boundary ramp to prevent clicks
      applySoftBoundaryRamp(float32, 24);

      const audioBuf = ctx.createBuffer(1, float32.length, VOICE_TARGET_SAMPLE_RATE);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;

      if (this.masterGain) {
        src.connect(this.masterGain);
      } else {
        src.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      const prevTime = this.speakerPlaybackTimes.get(pcId) || 0;

      let startTime: number;
      if (prevTime < now - 0.04) {
        // Start of phrase or packet gap: apply 35ms jitter cushion for flawless smooth playback
        startTime = now + 0.035;
      } else {
        startTime = Math.max(now, prevTime);
      }

      src.start(startTime);
      this.speakerPlaybackTimes.set(pcId, startTime + audioBuf.duration);

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
      applySoftBoundaryRamp(float32, 24);

      const audioBuf = ctx.createBuffer(1, float32.length, VOICE_TARGET_SAMPLE_RATE);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;

      const intercomGain = ctx.createGain();
      intercomGain.gain.setValueAtTime(Math.min(1.0, this.volume * 1.25), ctx.currentTime);
      src.connect(intercomGain);
      intercomGain.connect(this.masterCompressor || ctx.destination);

      const now = ctx.currentTime;
      let startTime = Math.max(now, this.intercomPlaybackTime);
      if (startTime < now - 0.05) {
        this.playChime(ctx);
        startTime = now + 0.35; // Allow chime to ring first
      }

      src.start(startTime);
      this.intercomPlaybackTime = startTime + audioBuf.duration;
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

  // Start Capturing Local Microphone with High-Fidelity 24kHz Anti-Aliased Resampling
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
          channelCount: 1,
          sampleRate: 48000
        }
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.captureCtx = new AudioCtxClass();
      this.micSource = this.captureCtx.createMediaStreamSource(this.micStream);

      // ScriptProcessor with 4096 buffer size (~85ms slices at 48kHz for rock-solid stability)
      this.scriptProcessor = this.captureCtx.createScriptProcessor(4096, 1, 1);

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

        // VAD Hysteresis / Hang Time (keeps transmitting 250ms after speech stops so word endings are not cut off)
        if (isVoiceActive) {
          this.isVadHangActive = true;
          if (this.vadHangTimer) {
            clearTimeout(this.vadHangTimer);
            this.vadHangTimer = null;
          }
        } else if (this.isVadHangActive && !this.vadHangTimer) {
          this.vadHangTimer = setTimeout(() => {
            this.isVadHangActive = false;
            this.vadHangTimer = null;
          }, 260);
        }

        const shouldTransmit = this.voiceMode === 'ptt' ? this.isPttPressed : (isVoiceActive || this.isVadHangActive);

        if (shouldTransmit) {
          this.notifySelfTalking(true);

          // Anti-aliased resampling to 24,000 Hz Wideband HD Voice
          const resampledFloat = resampleFloat32(inputData, inputSampleRate, VOICE_TARGET_SAMPLE_RATE);
          applySoftBoundaryRamp(resampledFloat, 24);

          // Convert to Int16 PCM with soft limiter saturation
          const int16Array = new Int16Array(resampledFloat.length);
          for (let i = 0; i < resampledFloat.length; i++) {
            const s = softLimitSample(resampledFloat[i]);
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

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
      }, 260);
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
    }, 320);
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
    this.speakerPlaybackTimes.clear();
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
