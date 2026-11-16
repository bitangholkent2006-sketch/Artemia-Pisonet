import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../../services/api-client.service';
import { AdminStateService } from '../../services/admin-state.service';
import { AdminVoiceService, VoiceRoom, VoiceMember } from '../../services/admin-voice.service';
import { PC } from '@pisonet/shared';

@Component({
  selector: 'app-squad-voice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './squad-voice.component.html',
  styleUrls: ['./squad-voice.component.css']
})
export class SquadVoiceComponent implements OnInit, OnDestroy {
  private keydownListener?: (e: KeyboardEvent) => void;
  private keyupListener?: (e: KeyboardEvent) => void;

  constructor(
    public apiClient: ApiClientService,
    public adminState: AdminStateService,
    public voice: AdminVoiceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.setupKeyListeners();
    this.voice.init();
  }

  ngOnDestroy() {
    // DO NOT disconnect or leave room when switching tabs!
    // The voice call continues running seamlessly in the background.
    if (this.keydownListener) window.removeEventListener('keydown', this.keydownListener);
    if (this.keyupListener) window.removeEventListener('keyup', this.keyupListener);
  }

  get pcsList(): PC[] {
    return this.adminState.state?.pcs || [];
  }

  // Delegated Getters to AdminVoiceService
  get adminPcId() { return this.voice.adminPcId; }
  get adminName() { return this.voice.adminName; }
  get currentRoomId() { return this.voice.currentRoomId; }
  get currentRoomName() { return this.voice.currentRoomName; }
  get isMuted() { return this.voice.isMuted; }
  get isDeafened() { return this.voice.isDeafened; }
  get voiceMode() { return this.voice.voiceMode; }
  get isPttPressed() { return this.voice.isPttPressed; }
  get vadThreshold() { return this.voice.vadThreshold; }
  set vadThreshold(val: number) { this.voice.vadThreshold = val; }
  get volume() { return this.voice.volume; }
  get micLevelPercent() { return this.voice.micLevelPercent; }
  get isIntercomBroadcasting() { return this.voice.isIntercomBroadcasting; }
  get intercomTargetPcId() { return this.voice.intercomTargetPcId; }
  set intercomTargetPcId(val: string) { this.voice.intercomTargetPcId = val; }
  get rooms() { return this.voice.rooms; }
  get members() { return this.voice.members; }
  get speakingMembers() { return this.voice.speakingMembers; }

  // Keyboard Listeners for Push-to-Talk
  private setupKeyListeners() {
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (this.voice.currentRoomId && this.voice.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.voice.setPttState(true);
        this.cdr.detectChanges();
      }
    };

    this.keyupListener = (e: KeyboardEvent) => {
      if (this.voice.currentRoomId && this.voice.voiceMode === 'ptt' && (e.key === 'v' || e.key === 'V')) {
        this.voice.setPttState(false);
        this.cdr.detectChanges();
      }
    };

    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
  }

  // User Actions
  public async joinRoom(roomId: string) {
    await this.voice.joinRoom(roomId);
    this.cdr.detectChanges();
  }

  public leaveRoom() {
    this.voice.leaveRoom();
    this.cdr.detectChanges();
  }

  public toggleMute() {
    this.voice.toggleMute();
    this.cdr.detectChanges();
  }

  public toggleDeafen() {
    this.voice.toggleDeafen();
    this.cdr.detectChanges();
  }

  public setVoiceMode(mode: 'vad' | 'ptt') {
    this.voice.setVoiceMode(mode);
    this.cdr.detectChanges();
  }

  public setPttState(isDown: boolean) {
    this.voice.setPttState(isDown);
    this.cdr.detectChanges();
  }

  public setVolume(val: number) {
    this.voice.setVolume(val);
    this.cdr.detectChanges();
  }

  public onVolumeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value);
    this.voice.setVolume(val);
    this.cdr.detectChanges();
  }

  public onVadThresholdChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value) / 1000.0;
    this.voice.setVadThreshold(val);
    this.cdr.detectChanges();
  }

  public async startIntercom(targetPcId: string = 'all') {
    await this.voice.startIntercom(targetPcId);
    this.cdr.detectChanges();
  }

  public stopIntercom() {
    this.voice.stopIntercom();
    this.cdr.detectChanges();
  }

  public async startIntercomBroadcast() {
    await this.voice.startIntercom('all');
    this.cdr.detectChanges();
  }

  public stopIntercomBroadcast() {
    this.voice.stopIntercom();
    this.cdr.detectChanges();
  }
}
