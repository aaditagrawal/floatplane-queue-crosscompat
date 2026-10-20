// Internal Extension Types

export interface QueueVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: string;
  durationSeconds: number;
  subchannel?: string;
  creatorId?: string;
  creatorName?: string;
  releaseDate?: string;
  progress?: number;
  attachmentId?: string;
}

export interface QueueState {
  queue: QueueVideo[];
  currentIndex: number;
  isOpen: boolean;
  contextValid: boolean;
  sortOrder: SortOrder;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
}

export type SortOrder =
  | "manual"
  | "newest"
  | "oldest"
  | "duration-asc"
  | "duration-desc"
  | "title-asc"
  | "title-desc";
export type RepeatMode = "none" | "one" | "all";

export interface PlayerSettings {
  playbackSpeed: number;
  volume: number;
  muted: boolean;
  autoplay: boolean;
  skipIntro: boolean;
  skipIntroSeconds: number;
  skipOutro: boolean;
  skipOutroSeconds: number;
  defaultQuality: string;
  theaterMode: boolean;
  captionsEnabled: boolean;
  captionsLanguage: string;
  captionsFontSize: number;
  captionsBackground: boolean;
}

export interface ExtensionSettings {
  player: PlayerSettings;
  queue: {
    autoAddCurrentVideo: boolean;
    showNotifications: boolean;
    persistQueue: boolean;
    maxQueueSize: number;
  };
  ui: {
    panelPosition: "left" | "right";
    panelWidth: number;
    compactMode: boolean;
    showThumbnails: boolean;
    showDuration: boolean;
    showProgress: boolean;
    theme: "dark" | "light" | "system";
  };
  keyboard: {
    enabled: boolean;
    shortcuts: Record<string, string>;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  player: {
    playbackSpeed: 1,
    volume: 1,
    muted: false,
    autoplay: true,
    skipIntro: false,
    skipIntroSeconds: 10,
    skipOutro: false,
    skipOutroSeconds: 30,
    defaultQuality: "auto",
    theaterMode: false,
    captionsEnabled: false,
    captionsLanguage: "en",
    captionsFontSize: 100,
    captionsBackground: true,
  },
  queue: {
    autoAddCurrentVideo: true,
    showNotifications: true,
    persistQueue: true,
    maxQueueSize: 100,
  },
  ui: {
    panelPosition: "right",
    panelWidth: 360,
    compactMode: false,
    showThumbnails: true,
    showDuration: true,
    showProgress: true,
    theme: "dark",
  },
  keyboard: {
    enabled: true,
    shortcuts: {
      togglePlay: "Space",
      seekForward: "ArrowRight",
      seekBackward: "ArrowLeft",
      volumeUp: "ArrowUp",
      volumeDown: "ArrowDown",
      toggleMute: "m",
      toggleFullscreen: "f",
      toggleTheater: "t",
      toggleCaptions: "c",
      speedUp: ">",
      speedDown: "<",
      nextVideo: "n",
      prevVideo: "p",
      toggleQueue: "q",
      addToQueue: "a",
    },
  },
};

export interface SubscriptionData {
  creatorId: string;
  creatorName: string;
  creatorIcon: string;
  creatorUrl: string;
  channels: {
    id: string;
    title: string;
    urlname: string;
    icon?: string;
  }[];
  planTitle: string;
  endDate: string;
}
