import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../services/api-client.service';
import { AdminStateService } from '../../services/admin-state.service';
import { PC } from '@pisonet/shared';

export interface VoiceMember {
  socketId?: string;
  pcId: string;
  pcName: string;
  roomId?: string;
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

@Component({
  selector: 'app-squad-voice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './squad-voice.component.html',
  styleUrls: ['./squad-voice.component.css']
})
export class SquadVoiceComponent implements OnInit, OnDestroy {
  // Identity
  public adminPcId = 'admin-laptop';
  public adminName = '👑 Admin (Laptop Operator)';

  // Audio Contexts
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

  private socketCleanups: Array<() => void> = [];
  private keydownListener?: (e: KeyboardEvent) => void;
  private keyupListener?: (e: KeyboardEvent) => void;

  constructor(
    public apiClient: ApiClientService,
    public adminState: AdminStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.setupSocketEvents();
    this.setupKeyListeners();
    this.apiClient.emitSocket('voice:get-rooms', {});
  }

  ngOnDestroy() {
    this.cleanupVoice();
    this.socketCleanups.forEach(fn => fn());
    if (this.keydownListener) window.removeEventListener('keydown', this.keydownListener);
    if (this.keyupListener) window.removeEventListener('keyup', this.keyupListener);
  }

  get pcsList(): PC[] {
    return this.adminState.state?.pcs || [];
  }

  private setupSocketEvents() {
    const c1 = this.apiClient.onSocketEvent('voice:rooms-status', (payload: { rooms: VoiceRoom[] }) => {
      if (payload?.rooms) {
        this.rooms = payload.rooms;
        if (this.currentRoomId) {
          const found = this.rooms.find(r => r.id === this.currentRoomId);
          if (found) this.members = found.members || [];
        }
        this.cdr.detectChanges();
      }
    });

    const c2 = this.apiClient.onSocketEvent('voice:members-updated', (payload: { roomId: string; members: VoiceMember[] }) => {
      if (this.currentRoomId === payload?.roomId) {
        this.members = payload.members || [];
        this.cdr.detectChanges();
      }
    });

    const c3 = this.apiClient.onSocketEvent('voice:member-state', (payload: { roomId: string; pcId: string; isMuted?: boolean; isDeafened?: boolean; isTalking?: boolean }) => {
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
      this.cdr.detectChanges();
    });

    const c4 = this.apiClient.onSocketEvent('voice:audio-chunk', (payload: { roomId: string; pcId: string; pcName: string; data: any }) => {
      if (!this.currentRoomId || this.currentRoomId !== payload.roomId) return;
      if (payload.pcId === this.adminPcId) return; // Do not play own audio back
      if (this.isDeafened) return;

      this.playIncomingChunk(payload.pcId, payload.data);
    });

    this.socketCleanups.push(c1, c2, c3, c4);
  }

  private setupKeyListeners() {
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (this.currentRoomId && this.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.isPttPressed = true;
        this.notifySelfTalking(true);
        this.cdr.detectChanges();
      }
      if (e.key === 'm' || e.key === 'M') {
        this.toggleMute();
      }
      if (e.key === 'd' || e.key === 'D') {
        this.toggleDeafen();
      }
    };

    this.keyupListener = (e: KeyboardEvent) => {
      if (this.currentRoomId && this.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.isPttPressed = false;
        this.notifySelfTalking(false);
        this.cdr.detectChanges();
      }
    };

    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
  }

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
        startTime = now + 0.035;
      } else {
        startTime = Math.max(now, prevTime);
      }

      src.start(startTime);
      this.speakerPlaybackTimes.set(pcId, startTime + audioBuf.duration);
      this.setMemberSpeaking(pcId);
    } catch (err) {
      console.warn('[AdminSquadVoice] Playback error:', err);
    }
  }

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

      // ScriptProcessor with 4096 buffer size (~85ms slices)
      this.scriptProcessor = this.captureCtx.createScriptProcessor(4096, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const inputSampleRate = e.inputBuffer.sampleRate;

        // RMS for VU meter and VAD
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.micLevelPercent = Math.min(100, Math.round(rms * 400));

        if (!this.currentRoomId && !this.isIntercomBroadcasting) {
          if (this.lastSelfTalkingState) this.notifySelfTalking(false);
          return;
        }

        if (this.isMuted || this.isDeafened) {
          if (this.lastSelfTalkingState) this.notifySelfTalking(false);
          return;
        }

        const isVoiceActive = rms > this.vadThreshold;
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

        const shouldTransmit = this.isIntercomBroadcasting || (this.voiceMode === 'ptt' ? this.isPttPressed : (isVoiceActive || this.isVadHangActive));

        if (shouldTransmit) {
          this.notifySelfTalking(true);

          const resampled = resampleFloat32(inputData, inputSampleRate, VOICE_TARGET_SAMPLE_RATE);
          applySoftBoundaryRamp(resampled, 24);

          const int16Array = new Int16Array(resampled.length);
          for (let i = 0; i < resampled.length; i++) {
            const s = softLimitSample(resampled[i]);
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
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
          } else if (this.currentRoomId) {
            this.apiClient.emitSocket('voice:audio-chunk', {
              roomId: this.currentRoomId,
              pcId: this.adminPcId,
              pcName: this.adminName,
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
      console.error('[AdminSquadVoice] Mic capture error:', err);
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
        this.cdr.detectChanges();
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
          this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    }, 320);
    this.speakingTimeouts.set(pcId, timer);
    this.cdr.detectChanges();
  }

  // User Actions
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
    this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.notifySelfTalking(false);
    if (this.currentRoomId) {
      this.apiClient.emitSocket('voice:member-state', {
        roomId: this.currentRoomId,
        pcId: this.adminPcId,
        isMuted: this.isMuted
      });
    }
    this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  public setVoiceMode(mode: 'vad' | 'ptt') {
    this.voiceMode = mode;
    this.isPttPressed = false;
    this.cdr.detectChanges();
  }

  public setPttState(isDown: boolean) {
    if (this.voiceMode !== 'ptt') return;
    this.isPttPressed = isDown;
    this.notifySelfTalking(isDown);
    this.cdr.detectChanges();
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1.0, val / 100));
    if (this.masterGain && this.playbackCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.playbackCtx.currentTime);
    }
  }

  public async startIntercomBroadcast() {
    await this.startCapturing();
    this.isIntercomBroadcasting = true;
    this.notifySelfTalking(true);
    this.cdr.detectChanges();
  }

  public stopIntercomBroadcast() {
    this.isIntercomBroadcasting = false;
    this.notifySelfTalking(false);
    this.cdr.detectChanges();
  }

  private cleanupVoice() {
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
