import { Injectable } from '@angular/core';
import { ApiClientService } from './api-client.service';

export interface VoiceMember {
  socketId: string;
  pcId: string;
  pcName: string;
  roomId: string;
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

const VOICE_TARGET_SAMPLE_RATE = 24000;

function softLimitSample(s: number): number {
  if (s > 0.95) return 0.95 + 0.05 * Math.tanh((s - 0.95) / 0.05);
  if (s < -0.95) return -0.95 + 0.05 * Math.tanh((s + 0.95) / 0.05);
  return s;
}

function resampleFloat32(
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
      output[i] = totalWeight > 0 ? sum / totalWeight : input[Math.min(input.length - 1, Math.floor(srcStart))];
    }
  } else {
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

function applySoftBoundaryRamp(samples: Float32Array, rampSize: number = 24) {
  const len = samples.length;
  const actualRamp = Math.min(rampSize, Math.floor(len / 4));
  for (let i = 0; i < actualRamp; i++) {
    const factor = 0.5 * (1 - Math.cos((Math.PI * i) / actualRamp));
    samples[i] *= factor;
    samples[len - 1 - i] *= factor;
  }
}

@Injectable({
  providedIn: 'root'
})
export class AdminVoiceService {
  // Identity
  public adminPcId = 'admin-laptop';
  public adminName = '👑 Admin (Laptop Operator)';

  // Audio Contexts (Persistent across tab switches)
  private captureCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private playbackCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private speakerPlaybackTimes: Map<string, number> = new Map();

  // Active Call State
  public currentRoomId: string | null = null;
  public currentRoomName: string = '';
  public isMuted: boolean = false;
  public isDeafened: boolean = false;
  public voiceMode: 'vad' | 'ptt' = 'vad';
  public isPttPressed: boolean = false;
  public vadThreshold: number = 0.012;
  public volume: number = 0.90; // 0 to 1.0
  public micLevelPercent: number = 0;

  // Intercom State
  public isIntercomBroadcasting: boolean = false;
  public intercomTargetPcId: string = 'all';

  // Rooms and Members
  public rooms: VoiceRoom[] = [
    { id: 'lobby', name: '🔊 Shop Lobby', description: 'General All-PC Chat', maxSlots: 20, memberCount: 0, members: [] },
    { id: 'squad-1', name: '⚔️ Squad 1 (Team Alpha)', description: 'Party / Competitive Match', maxSlots: 5, memberCount: 0, members: [] },
    { id: 'squad-2', name: '🔥 Squad 2 (Team Bravo)', description: 'Party / Competitive Match', maxSlots: 5, memberCount: 0, members: [] },
    { id: 'squad-3', name: '⚡ Squad 3 (Team Charlie)', description: 'Party / Casual Match', maxSlots: 5, memberCount: 0, members: [] },
    { id: 'duo-1', name: '👥 Duo Room 1', description: '2-Player Private Duo', maxSlots: 2, memberCount: 0, members: [] },
    { id: 'duo-2', name: '👥 Duo Room 2', description: '2-Player Private Duo', maxSlots: 2, memberCount: 0, members: [] }
  ];
  public members: VoiceMember[] = [];
  public speakingMembers: Set<string> = new Set();
  private speakingTimeouts: Map<string, any> = new Map();

  private lastSelfTalkingState: boolean = false;
  private selfTalkingDebounceTimer: any = null;
  private vadHangTimer: any = null;
  private isVadHangActive: boolean = false;

  private initialized = false;

  constructor(private apiClient: ApiClientService) {
    this.init();
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    this.setupSocketEvents();

    // Auto-reconnect voice room when backend socket reconnects
    this.apiClient.connectionStatus$.subscribe((status) => {
      if (status === 'connected') {
        if (this.currentRoomId) {
          this.apiClient.emitSocket('voice:join', {
            roomId: this.currentRoomId,
            pcId: this.adminPcId,
            pcName: this.adminName,
            isMuted: this.isMuted,
            isDeafened: this.isDeafened
          });
        }
        this.apiClient.emitSocket('voice:get-rooms', {});
        if (this.captureCtx && this.captureCtx.state === 'suspended') {
          this.captureCtx.resume().catch(() => {});
        }
        if (this.playbackCtx && this.playbackCtx.state === 'suspended') {
          this.playbackCtx.resume().catch(() => {});
        }
      }
    });

    this.apiClient.emitSocket('voice:get-rooms', {});
  }

  private setupSocketEvents() {
    this.apiClient.onSocketEvent('voice:rooms-status', (payload: { rooms: VoiceRoom[] }) => {
      if (payload?.rooms) {
        this.rooms = payload.rooms;
        if (this.currentRoomId) {
          const found = this.rooms.find(r => r.id === this.currentRoomId);
          if (found) {
            this.members = found.members || [];
          }
        }
      }
    });

    this.apiClient.onSocketEvent('voice:members-updated', (payload: { roomId: string; members: VoiceMember[] }) => {
      if (this.currentRoomId === payload?.roomId) {
        this.members = payload.members || [];
      }
    });

    this.apiClient.onSocketEvent('voice:member-state', (payload: { roomId: string; pcId: string; isMuted?: boolean; isDeafened?: boolean; isTalking?: boolean }) => {
      if (this.currentRoomId !== payload?.roomId) return;
      const mem = this.members.find(m => m.pcId === payload.pcId);
      if (mem) {
        if (payload.isMuted !== undefined) mem.isMuted = payload.isMuted;
        if (payload.isDeafened !== undefined) mem.isDeafened = payload.isDeafened;
        if (payload.isTalking !== undefined) mem.isTalking = payload.isTalking;
      }
      if (payload.isTalking) {
        this.setMemberSpeaking(payload.pcId);
      }
    });

    // Inbound Squad Audio Chunks
    this.apiClient.onSocketEvent('voice:audio-chunk', (payload: { roomId: string; pcId: string; pcName: string; data: any }) => {
      if (!this.currentRoomId || this.currentRoomId !== payload?.roomId) return;
      if (payload.pcId === this.adminPcId) return; // Don't playback own voice
      if (this.isDeafened) return;

      this.playIncomingChunk(payload.pcId, payload.data);
    });
  }

  // Playback Context
  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackCtx = new AudioCtxClass();

      this.masterGain = this.playbackCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);

      this.masterCompressor = this.playbackCtx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-14, this.playbackCtx.currentTime);
      this.masterCompressor.knee.setValueAtTime(10, this.playbackCtx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(6, this.playbackCtx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.playbackCtx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.12, this.playbackCtx.currentTime);

      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.playbackCtx.destination);
      this.speakerPlaybackTimes.clear();
    }
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }
    return this.playbackCtx;
  }

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

      const audioBuffer = ctx.createBuffer(1, float32.length, VOICE_TARGET_SAMPLE_RATE);
      audioBuffer.copyToChannel(float32, 0);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.masterGain!);

      const now = ctx.currentTime;
      let nextPlayTime = this.speakerPlaybackTimes.get(pcId) || 0;
      if (nextPlayTime < now) {
        nextPlayTime = now + 0.035; // 35ms packet jitter cushion
      }

      sourceNode.start(nextPlayTime);
      this.speakerPlaybackTimes.set(pcId, nextPlayTime + audioBuffer.duration);

      this.setMemberSpeaking(pcId);
    } catch {}
  }

  // Microphone Capture
  public async startCapturing(): Promise<boolean> {
    if (this.micStream && this.captureCtx && this.captureCtx.state === 'running') {
      return true;
    }

    try {
      if (this.captureCtx && this.captureCtx.state === 'suspended') {
        await this.captureCtx.resume();
        return true;
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.captureCtx = new AudioCtxClass();

      this.micSource = this.captureCtx.createMediaStreamSource(this.micStream);
      this.scriptProcessor = this.captureCtx.createScriptProcessor(2048, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.isMuted) {
          this.micLevelPercent = 0;
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const inputSampleRate = e.inputBuffer.sampleRate;

        // Calculate Root-Mean-Square (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.micLevelPercent = Math.min(100, Math.round(rms * 500));

        const isVoiceActive = rms > this.vadThreshold;

        // VAD Hysteresis / Hang Time
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
            int16Array[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
          }

          if (this.currentRoomId) {
            this.apiClient.emitSocket('voice:audio-chunk', {
              roomId: this.currentRoomId,
              pcId: this.adminPcId,
              pcName: this.adminName,
              data: int16Array.buffer
            });
          }

          if (this.isIntercomBroadcasting) {
            if (this.intercomTargetPcId === 'all') {
              this.apiClient.emitSocket('voice:intercom:broadcast', {
                adminName: this.adminName,
                data: int16Array.buffer
              });
            } else {
              this.apiClient.emitSocket('voice:intercom:target', {
                targetPcId: this.intercomTargetPcId,
                adminName: this.adminName,
                data: int16Array.buffer
              });
            }
          }
        } else {
          this.notifySelfTalking(false);
        }
      };

      this.micSource.connect(this.scriptProcessor);
      const silentGain = this.captureCtx.createGain();
      silentGain.gain.setValueAtTime(0, this.captureCtx.currentTime);
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.captureCtx.destination);

      return true;
    } catch {
      return false;
    }
  }

  private notifySelfTalking(isTalking: boolean) {
    if (this.selfTalkingDebounceTimer) {
      clearTimeout(this.selfTalkingDebounceTimer);
      this.selfTalkingDebounceTimer = null;
    }

    if (isTalking) {
      if (!this.lastSelfTalkingState) {
        this.lastSelfTalkingState = true;
        this.setMemberSpeaking(this.adminPcId);
        if (this.currentRoomId) {
          this.apiClient.emitSocket('voice:member-state', {
            roomId: this.currentRoomId,
            pcId: this.adminPcId,
            isTalking: true
          });
        }
      }
    } else {
      this.selfTalkingDebounceTimer = setTimeout(() => {
        if (this.lastSelfTalkingState) {
          this.lastSelfTalkingState = false;
          this.speakingMembers.delete(this.adminPcId);
          if (this.currentRoomId) {
            this.apiClient.emitSocket('voice:member-state', {
              roomId: this.currentRoomId,
              pcId: this.adminPcId,
              isTalking: false
            });
          }
        }
      }, 260);
    }
  }

  private setMemberSpeaking(pcId: string) {
    this.speakingMembers.add(pcId);
    if (this.speakingTimeouts.has(pcId)) {
      clearTimeout(this.speakingTimeouts.get(pcId));
    }
    const timer = setTimeout(() => {
      this.speakingMembers.delete(pcId);
      this.speakingTimeouts.delete(pcId);
    }, 320);
    this.speakingTimeouts.set(pcId, timer);
  }

  // User Actions: Join, Leave, Mute, Deafen, Volume
  public async joinRoom(roomId: string) {
    await this.startCapturing();
    this.ensurePlaybackContext();

    this.currentRoomId = roomId;
    const room = this.rooms.find(r => r.id === roomId);
    this.currentRoomName = room ? room.name : roomId.toUpperCase();

    this.apiClient.emitSocket('voice:join', {
      roomId,
      pcId: this.adminPcId,
      pcName: this.adminName,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened
    });
  }

  public leaveRoom() {
    if (!this.currentRoomId) return;
    this.apiClient.emitSocket('voice:leave', { roomId: this.currentRoomId });
    this.currentRoomId = null;
    this.currentRoomName = '';
    this.members = [];
    this.speakingMembers.clear();
    this.lastSelfTalkingState = false;
    this.speakerPlaybackTimes.clear();
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.notifySelfTalking(false);
    }
    if (this.currentRoomId) {
      this.apiClient.emitSocket('voice:member-state', {
        roomId: this.currentRoomId,
        pcId: this.adminPcId,
        isMuted: this.isMuted
      });
    }
  }

  public toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    if (this.isDeafened && !this.isMuted) {
      this.isMuted = true;
    }
    if (this.currentRoomId) {
      this.apiClient.emitSocket('voice:member-state', {
        roomId: this.currentRoomId,
        pcId: this.adminPcId,
        isMuted: this.isMuted,
        isDeafened: this.isDeafened
      });
    }
  }

  public setVoiceMode(mode: 'vad' | 'ptt') {
    this.voiceMode = mode;
    this.isPttPressed = false;
  }

  public setPttState(isDown: boolean) {
    if (this.voiceMode !== 'ptt') return;
    this.isPttPressed = isDown;
    this.notifySelfTalking(isDown);
  }

  public setVolume(volPct: number) {
    this.volume = Math.max(0, Math.min(1.0, volPct / 100));
    if (this.masterGain && this.playbackCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);
    }
  }

  public setVadThreshold(val: number) {
    this.vadThreshold = val;
  }

  public async startIntercom(targetPcId: string = 'all') {
    await this.startCapturing();
    this.intercomTargetPcId = targetPcId;
    this.isIntercomBroadcasting = true;
  }

  public stopIntercom() {
    this.isIntercomBroadcasting = false;
  }
}
