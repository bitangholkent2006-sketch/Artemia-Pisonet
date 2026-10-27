/**
 * Storage adapter with BroadcastChannel synchronization
 * Enables instant multi-window / multi-tab live sync on the same device.
 */

export interface StorageChangePayload<T = unknown> {
  key: string;
  data: T;
  sourceId: string;
  timestamp: number;
}

export class LocalStorageAdapter {
  private instanceId = Math.random().toString(36).substring(2, 9);
  private channel: BroadcastChannel | null = null;
  private memoryFallback = new Map<string, string>();
  private listeners: ((payload: StorageChangePayload) => void)[] = [];

  constructor(private channelName = 'artemia-pisonet-sync-channel') {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          if (event.data && event.data.sourceId !== this.instanceId) {
            this.notifyListeners(event.data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or restricted, falling back to storage events', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue);
            this.notifyListeners({
              key: event.key,
              data: parsed,
              sourceId: 'storage-event',
              timestamp: Date.now()
            });
          } catch {
            // Ignore non-json values
          }
        }
      });
    }
  }

  public getItem<T>(key: string, defaultValue: T): T {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(key);
        if (item !== null) {
          return JSON.parse(item) as T;
        }
      } else {
        const item = this.memoryFallback.get(key);
        if (item) return JSON.parse(item) as T;
      }
    } catch (e) {
      console.warn(`Error reading localStorage key "${key}":`, e);
    }
    return defaultValue;
  }

  public setItem<T>(key: string, value: T, notify = true): void {
    const serialized = JSON.stringify(value);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, serialized);
      } else {
        this.memoryFallback.set(key, serialized);
      }
    } catch (e) {
      console.warn(`Error writing to localStorage key "${key}":`, e);
      this.memoryFallback.set(key, serialized);
    }

    if (notify) {
      const payload: StorageChangePayload<T> = {
        key,
        data: value,
        sourceId: this.instanceId,
        timestamp: Date.now()
      };
      if (this.channel) {
        try {
          this.channel.postMessage(payload);
        } catch (e) {
          console.warn('Error broadcasting sync message:', e);
        }
      }
    }
  }

  public removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      this.memoryFallback.delete(key);
    } catch (e) {
      console.warn(`Error removing key "${key}":`, e);
    }
  }

  public subscribe(listener: (payload: StorageChangePayload) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(payload: StorageChangePayload): void {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('Error in storage listener callback:', e);
      }
    }
  }
}
