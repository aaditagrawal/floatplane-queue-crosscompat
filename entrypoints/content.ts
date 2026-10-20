import "./content-styles.css";
import { z } from "zod";
import type {
  QueueVideo,
  QueueState,
  SortOrder,
  RepeatMode,
  ExtensionSettings,
  SubscriptionData,
} from "../utils/types";
import { DEFAULT_SETTINGS } from "../utils/types";
import * as api from "../utils/api";

// Decode persisted extension state before it enters the queue model.
const queueVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  thumbnail: z.string(),
  duration: z.string(),
  durationSeconds: z.number(),
  subchannel: z.string().optional(),
  creatorId: z.string().optional(),
  creatorName: z.string().optional(),
  releaseDate: z.string().optional(),
  progress: z.number().optional(),
  attachmentId: z.string().optional(),
});
const queueStorageSchema = z.object({
  fp_queue: z.array(queueVideoSchema).nullish(),
  fp_queue_index: z.number().nullish(),
  fp_queue_sort: z
    .enum([
      "manual",
      "newest",
      "oldest",
      "duration-asc",
      "duration-desc",
      "title-asc",
      "title-desc",
    ])
    .nullish(),
  fp_queue_repeat: z.enum(["none", "one", "all"]).nullish(),
  fp_queue_shuffle: z.boolean().optional(),
});
const creatorSummarySchema = z.object({ id: z.string(), title: z.string() });

export default defineContentScript({
  matches: ["*://*.floatplane.com/*"],
  runAt: "document_end",
  cssInjectionMode: "ui",

  async main() {
    // ===== STATE =====
    const STATE: QueueState = {
      queue: [],
      currentIndex: -1,
      isOpen: false,
      contextValid: true,
      sortOrder: "manual",
      repeatMode: "none",
      shuffleEnabled: false,
    };

    let SETTINGS: ExtensionSettings = { ...DEFAULT_SETTINGS };
    let subscriptions: SubscriptionData[] = [];
    let activePanel: "queue" | "browse" | "settings" | null = "queue";

    // ===== STORAGE =====
    const loadSettings = async (): Promise<void> => {
      try {
        const result = await browser.storage.local.get("fp_settings");
        if (result.fp_settings) {
          SETTINGS = { ...DEFAULT_SETTINGS, ...result.fp_settings };
        }
      } catch {
        // Use defaults
      }
    };

    const saveSettings = async (): Promise<void> => {
      try {
        await browser.storage.local.set({ fp_settings: SETTINGS });
      } catch {
        STATE.contextValid = false;
      }
    };

    const loadQueue = async (): Promise<void> => {
      try {
        const result = queueStorageSchema.parse(
          await browser.storage.local.get([
            "fp_queue",
            "fp_queue_index",
            "fp_queue_sort",
            "fp_queue_repeat",
            "fp_queue_shuffle",
          ]),
        );
        STATE.queue = result.fp_queue ?? [];
        STATE.currentIndex = result.fp_queue_index ?? -1;
        STATE.sortOrder = result.fp_queue_sort ?? "manual";
        STATE.repeatMode = result.fp_queue_repeat ?? "none";
        STATE.shuffleEnabled = result.fp_queue_shuffle === true;
        updateContainerVisibility();
        renderQueue();
        checkAutoAdd();
        tryAutoPlayVideo();
      } catch {
        STATE.contextValid = false;
      }
    };

    const saveQueue = async (): Promise<void> => {
      try {
        await browser.storage.local.set({
          fp_queue: STATE.queue,
          fp_queue_index: STATE.currentIndex,
          fp_queue_sort: STATE.sortOrder,
          fp_queue_repeat: STATE.repeatMode,
          fp_queue_shuffle: STATE.shuffleEnabled,
        });
        updateContainerVisibility();
        renderQueue();
      } catch {
        STATE.contextValid = false;
      }
    };

    // ===== QUEUE OPERATIONS =====
    const updateContainerVisibility = (): void => {
      const container = document.getElementById("fp-queue-container");
      if (container) {
        container.style.display = "flex";
      }
    };

    interface AddToQueueOptions {
      silent?: boolean;
      setAsCurrent?: boolean;
      position?: "end" | "next";
    }

    const addToQueue = (video: QueueVideo, options: AddToQueueOptions = {}): void => {
      const existingIndex = STATE.queue.findIndex((v) => v.id === video.id);

      if (existingIndex !== -1) {
        if (options.setAsCurrent) {
          STATE.currentIndex = existingIndex;
          saveQueue();
          if (!options.silent) showNotification(`Now Playing: ${video.title}`);
        } else {
          if (!options.silent) showNotification("Already in Queue");
        }
      } else {
        if (SETTINGS.queue.maxQueueSize && STATE.queue.length >= SETTINGS.queue.maxQueueSize) {
          showNotification("Queue is full");
          return;
        }

        if (options.position === "next" && STATE.currentIndex >= 0) {
          STATE.queue.splice(STATE.currentIndex + 1, 0, video);
          if (options.setAsCurrent) {
            STATE.currentIndex = STATE.currentIndex + 1;
          }
        } else {
          STATE.queue.push(video);
          if (options.setAsCurrent) {
            STATE.currentIndex = STATE.queue.length - 1;
          }
        }
        saveQueue();
        if (!options.silent) showNotification(`Added: ${video.title}`);
      }
    };

    const removeFromQueue = (index: number): void => {
      STATE.queue.splice(index, 1);
      if (STATE.currentIndex >= index && STATE.currentIndex > 0) {
        STATE.currentIndex--;
      }
      if (STATE.currentIndex >= STATE.queue.length) {
        STATE.currentIndex = STATE.queue.length - 1;
      }
      saveQueue();
    };

    const clearQueue = (): void => {
      STATE.queue = [];
      STATE.currentIndex = -1;
      saveQueue();
      showNotification("Queue cleared");
    };

    const moveInQueue = (fromIndex: number, toIndex: number): void => {
      if (fromIndex === toIndex) return;
      const item = STATE.queue.splice(fromIndex, 1)[0];
      if (!item) return;
      STATE.queue.splice(toIndex, 0, item);

      if (STATE.currentIndex === fromIndex) {
        STATE.currentIndex = toIndex;
      } else if (fromIndex < STATE.currentIndex && toIndex >= STATE.currentIndex) {
        STATE.currentIndex--;
      } else if (fromIndex > STATE.currentIndex && toIndex <= STATE.currentIndex) {
        STATE.currentIndex++;
      }
      saveQueue();
    };

    const sortQueue = (order: SortOrder): void => {
      if (order === "manual") {
        STATE.sortOrder = order;
        saveQueue();
        return;
      }

      const currentVideo = STATE.currentIndex >= 0 ? STATE.queue[STATE.currentIndex] : null;

      switch (order) {
        case "newest":
          STATE.queue.sort(
            (a, b) =>
              new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime(),
          );
          break;
        case "oldest":
          STATE.queue.sort(
            (a, b) =>
              new Date(a.releaseDate || 0).getTime() - new Date(b.releaseDate || 0).getTime(),
          );
          break;
        case "duration-asc":
          STATE.queue.sort((a, b) => (a.durationSeconds || 0) - (b.durationSeconds || 0));
          break;
        case "duration-desc":
          STATE.queue.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
          break;
        case "title-asc":
          STATE.queue.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case "title-desc":
          STATE.queue.sort((a, b) => b.title.localeCompare(a.title));
          break;
      }

      if (currentVideo) {
        STATE.currentIndex = STATE.queue.findIndex((v) => v.id === currentVideo.id);
      }

      STATE.sortOrder = order;
      saveQueue();
      showNotification(`Sorted by ${order.replace("-", " ")}`);
    };

    const shuffleQueue = (): void => {
      if (STATE.queue.length < 2) return;

      const currentVideo = STATE.currentIndex >= 0 ? STATE.queue[STATE.currentIndex] : null;

      for (let i = STATE.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const left = STATE.queue[i];
        const right = STATE.queue[j];
        if (!left || !right) continue;
        STATE.queue[i] = right;
        STATE.queue[j] = left;
      }

      if (currentVideo) {
        const newIndex = STATE.queue.findIndex((v) => v.id === currentVideo.id);
        const first = STATE.queue[0];
        const selected = STATE.queue[newIndex];
        if (newIndex > 0 && first && selected) {
          STATE.queue[0] = selected;
          STATE.queue[newIndex] = first;
        }
        STATE.currentIndex = 0;
      }

      STATE.sortOrder = "manual";
      saveQueue();
      showNotification("Queue shuffled");
    };

    // ===== NOTIFICATIONS =====
    const showNotification = (msg: string): void => {
      if (!SETTINGS.queue.showNotifications) return;

      let notif = document.getElementById("fp-queue-notification");
      if (!notif) {
        notif = document.createElement("div");
        notif.id = "fp-queue-notification";
        document.body.appendChild(notif);
      }
      notif.textContent = msg;
      notif.classList.add("show");
      setTimeout(() => notif?.classList.remove("show"), 3000);
    };

    // ===== SVG ICONS =====
    const icons = {
      list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
      play: "M5 3l14 9-14 9V3z",
      pause: "M6 4h4v16H6zM14 4h4v16h-4z",
      next: "M5 4l10 8-10 8V4zM19 5v14",
      prev: "M19 20L9 12l10-8v16zM5 19V5",
      volume: "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07",
      volumeMute: "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6",
      settings:
        "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z",
      fullscreen:
        "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3",
      captions: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
      speed:
        "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
      shuffle: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
      repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
      repeatOne:
        "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3M11 10h1v4",
      plus: "M12 5v14M5 12h14",
      minus: "M5 12h14",
      x: "M18 6L6 18M6 6l12 12",
      chevronDown: "M6 9l6 6 6-6",
      chevronUp: "M18 15l-6-6-6 6",
      browse: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
      search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
      theater: "M2 3h20v14H2zM8 21h8M12 17v4",
      pip: "M21 3H3v14h18V3zM15 9h4v6h-4z",
      download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
      heart:
        "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
      clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2",
    };

    const createIcon = (name: keyof typeof icons, size = 18): SVGSVGElement => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", size.toString());
      svg.setAttribute("height", size.toString());
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", icons[name]);
      svg.appendChild(path);
      return svg;
    };

    // ===== VIDEO PLAYER CONTROLS =====
    let playerControlsInjected = false;

    const injectPlayerControls = (): void => {
      const video = document.querySelector("video");
      if (!video || playerControlsInjected) return;

      // Sync with global playback rate (for extensions)
      const syncPlaybackRate = () => {
        if (video.playbackRate !== SETTINGS.player.playbackSpeed) {
          SETTINGS.player.playbackSpeed = video.playbackRate;
          updateSpeedDisplay();
        }
      };

      video.addEventListener("ratechange", syncPlaybackRate);

      // Apply saved settings
      video.playbackRate = SETTINGS.player.playbackSpeed;
      video.volume = SETTINGS.player.volume;
      video.muted = SETTINGS.player.muted;

      // Create controls overlay
      const videoContainer = video.closest(".vjs-tech")?.parentElement || video.parentElement;
      if (!videoContainer) return;

      const existingControls = videoContainer.querySelector(".fp-player-controls");
      if (existingControls) existingControls.remove();

      const controls = document.createElement("div");
      controls.className = "fp-player-controls";

      // Speed control
      const speedControl = document.createElement("div");
      speedControl.className = "fp-player-speed-control";

      const speedBtn = document.createElement("button");
      speedBtn.className = "fp-player-btn fp-speed-btn";
      speedBtn.title = "Playback Speed";
      speedBtn.innerHTML = `<span class="fp-speed-value">${SETTINGS.player.playbackSpeed}x</span>`;

      const speedMenu = document.createElement("div");
      speedMenu.className = "fp-speed-menu";

      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
      speeds.forEach((speed) => {
        const item = document.createElement("button");
        item.className = `fp-speed-item ${speed === SETTINGS.player.playbackSpeed ? "active" : ""}`;
        item.textContent = `${speed}x`;
        item.onclick = () => {
          video.playbackRate = speed;
          SETTINGS.player.playbackSpeed = speed;
          saveSettings();
          updateSpeedDisplay();
          speedMenu.classList.remove("show");
        };
        speedMenu.appendChild(item);
      });

      // Custom speed input
      const customSpeed = document.createElement("div");
      customSpeed.className = "fp-speed-custom";
      const customInput = document.createElement("input");
      customInput.type = "number";
      customInput.min = "0.1";
      customInput.max = "16";
      customInput.step = "0.1";
      customInput.value = SETTINGS.player.playbackSpeed.toString();
      customInput.placeholder = "Custom";
      customInput.onchange = () => {
        const val = parseFloat(customInput.value);
        if (val >= 0.1 && val <= 16) {
          video.playbackRate = val;
          SETTINGS.player.playbackSpeed = val;
          saveSettings();
          updateSpeedDisplay();
        }
      };
      customSpeed.appendChild(customInput);
      speedMenu.appendChild(customSpeed);

      speedBtn.onclick = (e) => {
        e.stopPropagation();
        speedMenu.classList.toggle("show");
      };

      speedControl.appendChild(speedBtn);
      speedControl.appendChild(speedMenu);

      // Caption control
      const captionBtn = document.createElement("button");
      captionBtn.className = "fp-player-btn";
      captionBtn.title = "Captions";
      captionBtn.appendChild(createIcon("captions", 20));
      captionBtn.onclick = () => toggleCaptions();

      // Theater mode
      const theaterBtn = document.createElement("button");
      theaterBtn.className = "fp-player-btn";
      theaterBtn.title = "Theater Mode (t)";
      theaterBtn.appendChild(createIcon("theater", 20));
      theaterBtn.onclick = () => toggleTheaterMode();

      // PiP
      const pipBtn = document.createElement("button");
      pipBtn.className = "fp-player-btn";
      pipBtn.title = "Picture in Picture";
      pipBtn.appendChild(createIcon("pip", 20));
      pipBtn.onclick = async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (video.requestPictureInPicture) {
            await video.requestPictureInPicture();
          }
        } catch (err) {
          console.error("PiP error:", err);
        }
      };

      // Skip buttons
      const skipBackBtn = document.createElement("button");
      skipBackBtn.className = "fp-player-btn";
      skipBackBtn.title = "Skip -10s";
      skipBackBtn.innerHTML = '<span style="font-size:12px">-10</span>';
      skipBackBtn.onclick = () => {
        video.currentTime -= 10;
      };

      const skipFwdBtn = document.createElement("button");
      skipFwdBtn.className = "fp-player-btn";
      skipFwdBtn.title = "Skip +10s";
      skipFwdBtn.innerHTML = '<span style="font-size:12px">+10</span>';
      skipFwdBtn.onclick = () => {
        video.currentTime += 10;
      };

      // Queue nav
      const prevBtn = document.createElement("button");
      prevBtn.className = "fp-player-btn";
      prevBtn.title = "Previous (p)";
      prevBtn.appendChild(createIcon("prev", 20));
      prevBtn.onclick = playPrevious;

      const nextBtn = document.createElement("button");
      nextBtn.className = "fp-player-btn";
      nextBtn.title = "Next (n)";
      nextBtn.appendChild(createIcon("next", 20));
      nextBtn.onclick = playNext;

      // Add to queue
      const addQueueBtn = document.createElement("button");
      addQueueBtn.className = "fp-player-btn";
      addQueueBtn.title = "Add to Queue (a)";
      addQueueBtn.appendChild(createIcon("plus", 20));
      addQueueBtn.onclick = () => {
        const videoInfo = getCurrentVideoInfo();
        if (videoInfo) {
          addToQueue(videoInfo);
        }
      };

      // Assemble controls
      controls.appendChild(prevBtn);
      controls.appendChild(skipBackBtn);
      controls.appendChild(skipFwdBtn);
      controls.appendChild(nextBtn);
      controls.appendChild(speedControl);
      controls.appendChild(captionBtn);
      controls.appendChild(theaterBtn);
      controls.appendChild(pipBtn);
      controls.appendChild(addQueueBtn);

      videoContainer.style.position = "relative";
      videoContainer.appendChild(controls);
      playerControlsInjected = true;

      // Auto-hide controls
      let hideTimeout: ReturnType<typeof setTimeout>;
      const showControls = () => {
        controls.classList.add("show");
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => controls.classList.remove("show"), 3000);
      };

      videoContainer.addEventListener("mousemove", showControls);
      videoContainer.addEventListener("mouseenter", showControls);
      controls.addEventListener("mouseenter", () => {
        clearTimeout(hideTimeout);
        controls.classList.add("show");
      });

      // Ended event for queue
      video.addEventListener("ended", handleVideoEnded);

      // Progress tracking
      let lastProgressUpdate = 0;
      video.addEventListener("timeupdate", () => {
        const now = Date.now();
        if (now - lastProgressUpdate > 10000) {
          // Every 10 seconds
          lastProgressUpdate = now;
          const postId = getPostIdFromUrl();
          if (postId) {
            updateVideoProgress(postId, video.currentTime);
          }
        }
      });
    };

    const updateSpeedDisplay = (): void => {
      const speedValue = document.querySelector(".fp-speed-value");
      if (speedValue) {
        speedValue.textContent = `${SETTINGS.player.playbackSpeed}x`;
      }
      const speedItems = document.querySelectorAll(".fp-speed-item");
      speedItems.forEach((item) => {
        const speed = parseFloat(item.textContent || "1");
        item.classList.toggle("active", speed === SETTINGS.player.playbackSpeed);
      });
    };

    const toggleCaptions = (): void => {
      const video = document.querySelector("video");
      if (!video) return;

      // Try to find and toggle text tracks
      const tracks = video.textTracks;
      if (tracks.length > 0) {
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (!track) continue;
          if (track.kind === "subtitles" || track.kind === "captions") {
            track.mode = track.mode === "showing" ? "hidden" : "showing";
            SETTINGS.player.captionsEnabled = track.mode === "showing";
            saveSettings();
            showNotification(track.mode === "showing" ? "Captions on" : "Captions off");
            return;
          }
        }
      }

      // Try clicking Floatplane's CC button
      const ccBtn = document.querySelector<HTMLElement>(
        '[class*="captions"], [aria-label*="caption"], .vjs-captions-button',
      );
      if (ccBtn) {
        ccBtn.click();
      } else {
        showNotification("No captions available");
      }
    };

    const toggleTheaterMode = (): void => {
      document.body.classList.toggle("fp-theater-mode");
      SETTINGS.player.theaterMode = document.body.classList.contains("fp-theater-mode");
      saveSettings();
    };

    const handleVideoEnded = async (): Promise<void> => {
      if (!STATE.contextValid) return;

      await loadQueue();

      if (STATE.repeatMode === "one") {
        const video = document.querySelector("video");
        if (video) {
          video.currentTime = 0;
          video.play();
        }
        return;
      }

      let nextIndex = STATE.currentIndex + 1;

      if (nextIndex >= STATE.queue.length) {
        if (STATE.repeatMode === "all") {
          nextIndex = 0;
        } else {
          showNotification("Queue complete!");
          return;
        }
      }

      if (nextIndex < STATE.queue.length) {
        const nextVideo = STATE.queue[nextIndex];
        if (!nextVideo) return;
        showNotification(`Up Next: ${nextVideo.title}`);
        setTimeout(() => {
          STATE.currentIndex = nextIndex;
          saveQueue();
          window.location.href = nextVideo.url;
        }, 1500);
      }
    };

    const updateVideoProgress = async (postId: string, currentTime: number): Promise<void> => {
      try {
        // Find the video attachment ID
        const currentQueueItem = STATE.queue[STATE.currentIndex];
        if (currentQueueItem?.attachmentId) {
          await api.updateProgress(currentQueueItem.attachmentId, "video", Math.floor(currentTime));
        }
      } catch {
        // Silent fail
      }
    };

    // ===== KEYBOARD SHORTCUTS =====
    const setupKeyboardShortcuts = (): void => {
      document.addEventListener("keydown", (e) => {
        if (!SETTINGS.keyboard.enabled) return;

        // Don't trigger if typing in input
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        const video = document.querySelector("video");
        const key = e.key.toLowerCase();
        const shortcuts = SETTINGS.keyboard.shortcuts;

        switch (key) {
          case shortcuts.togglePlay?.toLowerCase():
          case " ":
            if (video) {
              e.preventDefault();
              if (video.paused) void video.play();
              else video.pause();
            }
            break;
          case shortcuts.seekForward?.toLowerCase():
          case "arrowright":
            if (video) {
              e.preventDefault();
              video.currentTime += e.shiftKey ? 30 : 10;
            }
            break;
          case shortcuts.seekBackward?.toLowerCase():
          case "arrowleft":
            if (video) {
              e.preventDefault();
              video.currentTime -= e.shiftKey ? 30 : 10;
            }
            break;
          case shortcuts.volumeUp?.toLowerCase():
          case "arrowup":
            if (video) {
              e.preventDefault();
              video.volume = Math.min(1, video.volume + 0.1);
              SETTINGS.player.volume = video.volume;
              saveSettings();
            }
            break;
          case shortcuts.volumeDown?.toLowerCase():
          case "arrowdown":
            if (video) {
              e.preventDefault();
              video.volume = Math.max(0, video.volume - 0.1);
              SETTINGS.player.volume = video.volume;
              saveSettings();
            }
            break;
          case shortcuts.toggleMute?.toLowerCase():
          case "m":
            if (video) {
              e.preventDefault();
              video.muted = !video.muted;
              SETTINGS.player.muted = video.muted;
              saveSettings();
            }
            break;
          case shortcuts.toggleFullscreen?.toLowerCase():
          case "f":
            e.preventDefault();
            toggleFullscreen();
            break;
          case shortcuts.toggleTheater?.toLowerCase():
          case "t":
            e.preventDefault();
            toggleTheaterMode();
            break;
          case shortcuts.toggleCaptions?.toLowerCase():
          case "c":
            e.preventDefault();
            toggleCaptions();
            break;
          case shortcuts.speedUp?.toLowerCase():
          case ">":
          case ".":
            if (video) {
              e.preventDefault();
              const newSpeed = Math.min(16, SETTINGS.player.playbackSpeed + 0.25);
              video.playbackRate = newSpeed;
              SETTINGS.player.playbackSpeed = newSpeed;
              saveSettings();
              updateSpeedDisplay();
              showNotification(`Speed: ${newSpeed}x`);
            }
            break;
          case shortcuts.speedDown?.toLowerCase():
          case "<":
          case ",":
            if (video) {
              e.preventDefault();
              const newSpeed = Math.max(0.25, SETTINGS.player.playbackSpeed - 0.25);
              video.playbackRate = newSpeed;
              SETTINGS.player.playbackSpeed = newSpeed;
              saveSettings();
              updateSpeedDisplay();
              showNotification(`Speed: ${newSpeed}x`);
            }
            break;
          case shortcuts.nextVideo?.toLowerCase():
          case "n":
            e.preventDefault();
            playNext();
            break;
          case shortcuts.prevVideo?.toLowerCase():
          case "p":
            e.preventDefault();
            playPrevious();
            break;
          case shortcuts.toggleQueue?.toLowerCase():
          case "q":
            e.preventDefault();
            toggleQueuePanel();
            break;
          case shortcuts.addToQueue?.toLowerCase():
          case "a":
            e.preventDefault();
            const videoInfo = getCurrentVideoInfo();
            if (videoInfo) {
              addToQueue(videoInfo);
            }
            break;
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            if (video) {
              e.preventDefault();
              video.currentTime = video.duration * (parseInt(key) / 10);
            }
            break;
        }
      });
    };

    const toggleFullscreen = (): void => {
      const video = document.querySelector("video");
      const container = video?.closest(".vjs-tech")?.parentElement || video?.parentElement;

      if (!document.fullscreenElement) {
        (container || document.documentElement).requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    };

    const toggleQueuePanel = (): void => {
      const container = document.getElementById("fp-queue-container");
      if (container) {
        container.classList.toggle("fp-queue-collapsed");
        STATE.isOpen = !container.classList.contains("fp-queue-collapsed");
      }
    };

    // ===== MAIN PANEL UI =====
    const createMainPanel = (): void => {
      if (document.getElementById("fp-queue-container")) return;

      const container = document.createElement("div");
      container.id = "fp-queue-container";
      container.className = "fp-queue-glass";

      // Tab bar
      const tabBar = document.createElement("div");
      tabBar.className = "fp-tab-bar";

      const tabs = [
        { id: "queue", label: "Queue", icon: "list" },
        { id: "browse", label: "Browse", icon: "browse" },
        { id: "settings", label: "Settings", icon: "settings" },
      ] as const;

      tabs.forEach((tab) => {
        const tabBtn = document.createElement("button");
        tabBtn.className = `fp-tab ${activePanel === tab.id ? "active" : ""}`;
        tabBtn.dataset.tab = tab.id;
        tabBtn.appendChild(createIcon(tab.icon, 16));
        const label = document.createElement("span");
        label.textContent = tab.label;
        tabBtn.appendChild(label);
        tabBtn.onclick = () => switchPanel(tab.id);
        tabBar.appendChild(tabBtn);
      });

      // Collapse button
      const collapseBtn = document.createElement("button");
      collapseBtn.className = "fp-collapse-btn";
      collapseBtn.appendChild(createIcon("chevronDown", 16));
      collapseBtn.onclick = toggleQueuePanel;
      tabBar.appendChild(collapseBtn);

      // Panel content
      const content = document.createElement("div");
      content.id = "fp-panel-content";

      container.appendChild(tabBar);
      container.appendChild(content);
      document.body.appendChild(container);

      // Initial render
      renderActivePanel();
    };

    const switchPanel = (panel: "queue" | "browse" | "settings"): void => {
      activePanel = panel;
      document.querySelectorAll<HTMLElement>(".fp-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === panel);
      });
      renderActivePanel();
    };

    const renderActivePanel = (): void => {
      const content = document.getElementById("fp-panel-content");
      if (!content) return;

      switch (activePanel) {
        case "queue":
          renderQueuePanel(content);
          break;
        case "browse":
          renderBrowsePanel(content);
          break;
        case "settings":
          renderSettingsPanel(content);
          break;
      }
    };

    // ===== QUEUE PANEL =====
    const renderQueuePanel = (container: HTMLElement): void => {
      container.innerHTML = "";

      // Header with controls
      const header = document.createElement("div");
      header.className = "fp-queue-header";

      const titleRow = document.createElement("div");
      titleRow.className = "fp-queue-title-row";

      const title = document.createElement("h3");
      title.textContent = `Queue (${STATE.queue.length})`;
      titleRow.appendChild(title);

      // Queue controls
      const controls = document.createElement("div");
      controls.className = "fp-queue-controls";

      // Sort dropdown
      const sortBtn = document.createElement("button");
      sortBtn.className = "fp-queue-btn";
      sortBtn.title = "Sort";
      sortBtn.innerHTML = "&#8645;";

      const sortMenu = document.createElement("div");
      sortMenu.className = "fp-dropdown-menu";
      sortMenu.style.display = "none";

      const sortOptions: { value: SortOrder; label: string }[] = [
        { value: "manual", label: "Manual" },
        { value: "newest", label: "Newest First" },
        { value: "oldest", label: "Oldest First" },
        { value: "duration-asc", label: "Shortest First" },
        { value: "duration-desc", label: "Longest First" },
        { value: "title-asc", label: "Title A-Z" },
        { value: "title-desc", label: "Title Z-A" },
      ];

      sortOptions.forEach((opt) => {
        const item = document.createElement("button");
        item.className = `fp-dropdown-item ${STATE.sortOrder === opt.value ? "active" : ""}`;
        item.textContent = opt.label;
        item.onclick = () => {
          sortQueue(opt.value);
          sortMenu.style.display = "none";
        };
        sortMenu.appendChild(item);
      });

      sortBtn.onclick = () => {
        sortMenu.style.display = sortMenu.style.display === "none" ? "block" : "none";
      };

      const sortWrapper = document.createElement("div");
      sortWrapper.className = "fp-dropdown-wrapper";
      sortWrapper.appendChild(sortBtn);
      sortWrapper.appendChild(sortMenu);

      // Shuffle button
      const shuffleBtn = document.createElement("button");
      shuffleBtn.className = `fp-queue-btn ${STATE.shuffleEnabled ? "active" : ""}`;
      shuffleBtn.title = "Shuffle";
      shuffleBtn.appendChild(createIcon("shuffle", 14));
      shuffleBtn.onclick = shuffleQueue;

      // Repeat button
      const repeatBtn = document.createElement("button");
      repeatBtn.className = `fp-queue-btn ${STATE.repeatMode !== "none" ? "active" : ""}`;
      repeatBtn.title = `Repeat: ${STATE.repeatMode}`;
      repeatBtn.appendChild(createIcon(STATE.repeatMode === "one" ? "repeatOne" : "repeat", 14));
      repeatBtn.onclick = () => {
        const modes: RepeatMode[] = ["none", "all", "one"];
        const currentIdx = modes.indexOf(STATE.repeatMode);
        STATE.repeatMode = modes[(currentIdx + 1) % modes.length] ?? "none";
        saveQueue();
        renderActivePanel();
        showNotification(`Repeat: ${STATE.repeatMode}`);
      };

      // Clear button
      const clearBtn = document.createElement("button");
      clearBtn.className = "fp-queue-btn fp-danger";
      clearBtn.title = "Clear Queue";
      clearBtn.appendChild(createIcon("x", 14));
      clearBtn.onclick = clearQueue;

      controls.appendChild(sortWrapper);
      controls.appendChild(shuffleBtn);
      controls.appendChild(repeatBtn);
      controls.appendChild(clearBtn);

      titleRow.appendChild(controls);
      header.appendChild(titleRow);

      // Now playing
      if (STATE.currentIndex >= 0 && STATE.queue[STATE.currentIndex]) {
        const nowPlaying = document.createElement("div");
        nowPlaying.className = "fp-now-playing";
        const npLabel = document.createElement("span");
        npLabel.className = "fp-np-label";
        npLabel.textContent = "Now Playing:";
        const npTitle = document.createElement("span");
        npTitle.className = "fp-np-title";
        npTitle.textContent = STATE.queue[STATE.currentIndex]?.title ?? "";
        nowPlaying.appendChild(npLabel);
        nowPlaying.appendChild(npTitle);
        header.appendChild(nowPlaying);
      }

      // Navigation
      const navRow = document.createElement("div");
      navRow.className = "fp-queue-nav";

      const prevBtn = document.createElement("button");
      prevBtn.className = "fp-nav-btn";
      prevBtn.appendChild(createIcon("prev", 16));
      prevBtn.appendChild(document.createTextNode(" Previous"));
      prevBtn.onclick = playPrevious;

      const nextBtn = document.createElement("button");
      nextBtn.className = "fp-nav-btn";
      nextBtn.appendChild(document.createTextNode("Next "));
      nextBtn.appendChild(createIcon("next", 16));
      nextBtn.onclick = playNext;

      navRow.appendChild(prevBtn);
      navRow.appendChild(nextBtn);
      header.appendChild(navRow);

      container.appendChild(header);

      // Queue list
      const list = document.createElement("div");
      list.className = "fp-queue-list";

      if (STATE.queue.length === 0) {
        const empty = document.createElement("div");
        empty.className = "fp-empty-state";
        empty.innerHTML = `
          <div class="fp-empty-icon">${createIcon("list", 48).outerHTML}</div>
          <p>Your queue is empty</p>
          <p class="fp-empty-hint">Click the + button on videos to add them</p>
        `;
        list.appendChild(empty);
      } else {
        STATE.queue.forEach((video, index) => {
          const item = createQueueItem(video, index);
          list.appendChild(item);
        });
      }

      container.appendChild(list);
    };

    const createQueueItem = (video: QueueVideo, index: number): HTMLElement => {
      const isCurrent = index === STATE.currentIndex;

      const item = document.createElement("div");
      item.className = `fp-queue-item ${isCurrent ? "current" : ""}`;
      item.draggable = true;

      // Drag and drop
      item.ondragstart = (e) => {
        e.dataTransfer?.setData("text/plain", index.toString());
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      };
      item.ondragend = () => item.classList.remove("dragging");
      item.ondragover = (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      };
      item.ondrop = (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") || "0");
        moveInQueue(fromIndex, index);
      };

      // Thumbnail
      const thumb = document.createElement("div");
      thumb.className = "fp-queue-item-thumb";
      if (video.thumbnail) {
        thumb.style.backgroundImage = `url('${video.thumbnail.replace(/'/g, "\\'")}')`;
      }

      if (isCurrent) {
        const indicator = document.createElement("div");
        indicator.className = "fp-playing-indicator";
        indicator.innerHTML = `<div class="fp-playing-bars"><span></span><span></span><span></span></div>`;
        thumb.appendChild(indicator);
      }

      // Duration badge
      if (video.duration) {
        const duration = document.createElement("span");
        duration.className = "fp-duration-badge";
        duration.textContent = video.duration;
        thumb.appendChild(duration);
      }

      // Progress bar
      if (video.progress && video.progress > 0) {
        const progress = document.createElement("div");
        progress.className = "fp-progress-bar";
        const fill = document.createElement("div");
        fill.className = "fp-progress-fill";
        fill.style.width = `${Math.min(100, video.progress)}%`;
        progress.appendChild(fill);
        thumb.appendChild(progress);
      }

      // Info
      const info = document.createElement("div");
      info.className = "fp-queue-item-info";

      const titleEl = document.createElement("div");
      titleEl.className = "fp-queue-item-title";
      titleEl.textContent = video.title;
      titleEl.title = video.title;

      const meta = document.createElement("div");
      meta.className = "fp-queue-item-meta";
      const metaParts = [];
      if (video.subchannel) metaParts.push(video.subchannel);
      if (video.creatorName) metaParts.push(video.creatorName);
      meta.textContent = metaParts.join(" • ");

      info.appendChild(titleEl);
      info.appendChild(meta);

      // Actions
      const actions = document.createElement("div");
      actions.className = "fp-queue-item-actions";

      const playBtn = document.createElement("button");
      playBtn.className = "fp-item-btn";
      playBtn.title = "Play";
      playBtn.appendChild(createIcon("play", 14));
      playBtn.onclick = (e) => {
        e.stopPropagation();
        STATE.currentIndex = index;
        saveQueue();
        window.location.href = video.url;
      };

      const removeBtn = document.createElement("button");
      removeBtn.className = "fp-item-btn fp-danger";
      removeBtn.title = "Remove";
      removeBtn.appendChild(createIcon("x", 14));
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeFromQueue(index);
      };

      actions.appendChild(playBtn);
      actions.appendChild(removeBtn);

      // Assemble
      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(actions);

      item.onclick = () => {
        STATE.currentIndex = index;
        saveQueue();
        window.location.href = video.url;
      };

      return item;
    };

    const renderQueue = (): void => {
      if (activePanel === "queue") {
        const content = document.getElementById("fp-panel-content");
        if (content) renderQueuePanel(content);
      }
    };

    // ===== BROWSE PANEL =====
    const renderBrowsePanel = async (container: HTMLElement): Promise<void> => {
      container.innerHTML = "";

      const header = document.createElement("div");
      header.className = "fp-browse-header";

      const title = document.createElement("h3");
      title.textContent = "Browse";
      header.appendChild(title);

      container.appendChild(header);

      // Loading state
      const loading = document.createElement("div");
      loading.className = "fp-loading";
      loading.textContent = "Loading subscriptions...";
      container.appendChild(loading);

      try {
        if (subscriptions.length === 0) {
          await loadSubscriptions();
        }

        loading.remove();

        if (subscriptions.length === 0) {
          const empty = document.createElement("div");
          empty.className = "fp-empty-state";
          empty.innerHTML = `
            <p>No subscriptions found</p>
            <p class="fp-empty-hint">Make sure you're logged into Floatplane</p>
          `;
          container.appendChild(empty);
          return;
        }

        // Subscription list
        const subList = document.createElement("div");
        subList.className = "fp-sub-list";

        subscriptions.forEach((sub) => {
          const subItem = document.createElement("div");
          subItem.className = "fp-sub-item";

          const icon = document.createElement("img");
          icon.className = "fp-sub-icon";
          icon.src = sub.creatorIcon;
          icon.alt = sub.creatorName;

          const info = document.createElement("div");
          info.className = "fp-sub-info";

          const name = document.createElement("div");
          name.className = "fp-sub-name";
          name.textContent = sub.creatorName;

          const plan = document.createElement("div");
          plan.className = "fp-sub-plan";
          plan.textContent = sub.planTitle;

          info.appendChild(name);
          info.appendChild(plan);

          const expandBtn = document.createElement("button");
          expandBtn.className = "fp-sub-expand";
          expandBtn.appendChild(createIcon("chevronDown", 16));

          subItem.appendChild(icon);
          subItem.appendChild(info);
          subItem.appendChild(expandBtn);

          // Content area (hidden by default)
          const contentArea = document.createElement("div");
          contentArea.className = "fp-sub-content";
          contentArea.style.display = "none";

          subItem.onclick = async () => {
            const isOpen = contentArea.style.display !== "none";
            contentArea.style.display = isOpen ? "none" : "block";
            expandBtn.querySelector("svg")?.classList.toggle("rotated", !isOpen);

            if (!isOpen && contentArea.children.length === 0) {
              await loadCreatorContent(sub.creatorId, contentArea);
            }
          };

          subList.appendChild(subItem);
          subList.appendChild(contentArea);
        });

        container.appendChild(subList);
      } catch {
        loading.remove();
        const errorEl = document.createElement("div");
        errorEl.className = "fp-error";
        errorEl.textContent = "Failed to load subscriptions. Please make sure you are logged in.";
        container.appendChild(errorEl);
      }
    };

    const loadSubscriptions = async (): Promise<void> => {
      try {
        const subs = await api.getUserSubscriptions();
        const creatorIds = [...new Set(subs.map((s) => s.creator))];

        // Fetch creator details
        const creatorPromises = creatorIds.map((id) => api.getCreatorInfo(id).catch(() => null));
        const creators = await Promise.all(creatorPromises);
        const creatorMap = new Map(creators.filter(Boolean).map((c) => [c!.id, c!]));

        subscriptions = subs.map((sub) => {
          const creator = creatorMap.get(sub.creator);
          return {
            creatorId: sub.creator,
            creatorName: creator?.title || "Unknown",
            creatorIcon: creator?.icon?.path || "",
            creatorUrl: creator?.urlname || "",
            channels:
              creator?.channels.map((channel) => ({
                ...channel,
                icon: api.getImageUrl(channel.icon),
              })) || [],
            planTitle: sub.plan.title,
            endDate: sub.endDate,
          };
        });
      } catch (error) {
        console.error("Failed to load subscriptions:", error);
        throw error;
      }
    };

    const loadCreatorContent = async (creatorId: string, container: HTMLElement): Promise<void> => {
      const loading = document.createElement("div");
      loading.className = "fp-loading-small";
      loading.textContent = "Loading videos...";
      container.appendChild(loading);

      try {
        const content = await api.getCreatorContent({ id: creatorId, limit: 20, hasVideo: true });
        loading.remove();

        if (content.length === 0) {
          const empty = document.createElement("div");
          empty.className = "fp-empty-small";
          empty.textContent = "No videos found";
          container.appendChild(empty);
          return;
        }

        content.forEach((post) => {
          const item = createBrowseItem(post);
          container.appendChild(item);
        });

        // Load more button
        if (content.length === 20) {
          const loadMoreBtn = document.createElement("button");
          loadMoreBtn.className = "fp-load-more";
          loadMoreBtn.textContent = "Load More";
          loadMoreBtn.onclick = async () => {
            loadMoreBtn.textContent = "Loading...";
            try {
              const moreContent = await api.getCreatorContent({
                id: creatorId,
                limit: 20,
                hasVideo: true,
                fetchAfter: content.at(-1)?.id,
              });
              loadMoreBtn.remove();
              moreContent.forEach((post) => {
                const item = createBrowseItem(post);
                container.appendChild(item);
              });
              if (moreContent.length === 20) {
                container.appendChild(loadMoreBtn);
                loadMoreBtn.textContent = "Load More";
              }
            } catch {
              loadMoreBtn.textContent = "Load More";
            }
          };
          container.appendChild(loadMoreBtn);
        }
      } catch {
        loading.remove();
        const error = document.createElement("div");
        error.className = "fp-error-small";
        error.textContent = "Failed to load content";
        container.appendChild(error);
      }
    };

    const createBrowseItem = (post: api.BlogPost): HTMLElement => {
      const item = document.createElement("div");
      item.className = "fp-browse-item";

      const thumb = document.createElement("div");
      thumb.className = "fp-browse-thumb";
      if (post.thumbnail) {
        thumb.style.backgroundImage = `url('${api.getOptimalThumbnail(post.thumbnail)}')`;
      }

      // Duration badge
      if (post.metadata.videoDuration) {
        const duration = document.createElement("span");
        duration.className = "fp-duration-badge";
        duration.textContent = api.formatDuration(post.metadata.videoDuration);
        thumb.appendChild(duration);
      }

      const info = document.createElement("div");
      info.className = "fp-browse-info";

      const titleEl = document.createElement("div");
      titleEl.className = "fp-browse-title";
      titleEl.textContent = post.title;
      titleEl.title = post.title;

      const meta = document.createElement("div");
      meta.className = "fp-browse-meta";
      meta.textContent = `${post.channel?.title || ""} • ${api.timeAgo(post.releaseDate)}`;

      info.appendChild(titleEl);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "fp-browse-actions";

      const addBtn = document.createElement("button");
      addBtn.className = "fp-item-btn";
      addBtn.title = "Add to Queue";
      addBtn.appendChild(createIcon("plus", 14));
      addBtn.onclick = (e) => {
        e.stopPropagation();
        const parsedCreator = creatorSummarySchema.safeParse(post.creator);
        const creator = parsedCreator.success ? parsedCreator.data : undefined;
        const video: QueueVideo = {
          id: post.id,
          title: post.title,
          url: `https://www.floatplane.com/post/${post.id}`,
          thumbnail: api.getOptimalThumbnail(post.thumbnail),
          duration: api.formatDuration(post.metadata.videoDuration || 0),
          durationSeconds: post.metadata.videoDuration || 0,
          subchannel: post.channel?.title,
          creatorId: creator?.id,
          creatorName: creator?.title,
          releaseDate: post.releaseDate,
          attachmentId: post.videoAttachments?.[0]?.id,
        };
        addToQueue(video);
      };

      const addNextBtn = document.createElement("button");
      addNextBtn.className = "fp-item-btn";
      addNextBtn.title = "Play Next";
      addNextBtn.appendChild(createIcon("next", 14));
      addNextBtn.onclick = (e) => {
        e.stopPropagation();
        const parsedCreator = creatorSummarySchema.safeParse(post.creator);
        const creator = parsedCreator.success ? parsedCreator.data : undefined;
        const video: QueueVideo = {
          id: post.id,
          title: post.title,
          url: `https://www.floatplane.com/post/${post.id}`,
          thumbnail: api.getOptimalThumbnail(post.thumbnail),
          duration: api.formatDuration(post.metadata.videoDuration || 0),
          durationSeconds: post.metadata.videoDuration || 0,
          subchannel: post.channel?.title,
          creatorId: creator?.id,
          creatorName: creator?.title,
          releaseDate: post.releaseDate,
          attachmentId: post.videoAttachments?.[0]?.id,
        };
        addToQueue(video, { position: "next" });
        showNotification(`Playing next: ${video.title}`);
      };

      actions.appendChild(addBtn);
      actions.appendChild(addNextBtn);

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(actions);

      item.onclick = () => {
        window.location.href = `https://www.floatplane.com/post/${post.id}`;
      };

      return item;
    };

    // ===== SETTINGS PANEL =====
    const renderSettingsPanel = (container: HTMLElement): void => {
      container.innerHTML = "";

      const header = document.createElement("div");
      header.className = "fp-settings-header";
      const title = document.createElement("h3");
      title.textContent = "Settings";
      header.appendChild(title);
      container.appendChild(header);

      type Setting = { label: string } & (
        | { type: "toggle"; get: () => boolean; set: (value: boolean) => void }
        | {
            type: "select";
            get: () => number;
            set: (value: number) => void;
            options: number[];
            format?: (value: number) => string;
          }
        | {
            type: "number";
            get: () => number;
            set: (value: number) => void;
            min?: number;
            max?: number;
          }
      );
      const sections: Array<{ title: string; settings: Setting[] }> = [
        {
          title: "Playback",
          settings: [
            {
              get: () => SETTINGS.player.playbackSpeed,
              set: (value) => {
                SETTINGS.player.playbackSpeed = value;
              },
              label: "Default Speed",
              type: "select",
              options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
              format: (v: number) => `${v}x`,
            },
            {
              get: () => SETTINGS.player.autoplay,
              set: (value) => {
                SETTINGS.player.autoplay = value;
              },
              label: "Autoplay Next",
              type: "toggle",
            },
            {
              get: () => SETTINGS.player.captionsEnabled,
              set: (value) => {
                SETTINGS.player.captionsEnabled = value;
              },
              label: "Enable Captions",
              type: "toggle",
            },
          ],
        },
        {
          title: "Queue",
          settings: [
            {
              get: () => SETTINGS.queue.autoAddCurrentVideo,
              set: (value) => {
                SETTINGS.queue.autoAddCurrentVideo = value;
              },
              label: "Auto-add Current Video",
              type: "toggle",
            },
            {
              get: () => SETTINGS.queue.showNotifications,
              set: (value) => {
                SETTINGS.queue.showNotifications = value;
              },
              label: "Show Notifications",
              type: "toggle",
            },
            {
              get: () => SETTINGS.queue.maxQueueSize,
              set: (value) => {
                SETTINGS.queue.maxQueueSize = value;
              },
              label: "Max Queue Size",
              type: "number",
              min: 10,
              max: 500,
            },
          ],
        },
        {
          title: "Interface",
          settings: [
            {
              get: () => SETTINGS.ui.compactMode,
              set: (value) => {
                SETTINGS.ui.compactMode = value;
              },
              label: "Compact Mode",
              type: "toggle",
            },
            {
              get: () => SETTINGS.ui.showThumbnails,
              set: (value) => {
                SETTINGS.ui.showThumbnails = value;
              },
              label: "Show Thumbnails",
              type: "toggle",
            },
            {
              get: () => SETTINGS.ui.showProgress,
              set: (value) => {
                SETTINGS.ui.showProgress = value;
              },
              label: "Show Progress",
              type: "toggle",
            },
          ],
        },
        {
          title: "Keyboard Shortcuts",
          settings: [
            {
              get: () => SETTINGS.keyboard.enabled,
              set: (value) => {
                SETTINGS.keyboard.enabled = value;
              },
              label: "Enable Shortcuts",
              type: "toggle",
            },
          ],
        },
      ];

      const scrollArea = document.createElement("div");
      scrollArea.className = "fp-settings-scroll";

      sections.forEach((section) => {
        const sectionEl = document.createElement("div");
        sectionEl.className = "fp-settings-section";

        const sectionTitle = document.createElement("h4");
        sectionTitle.textContent = section.title;
        sectionEl.appendChild(sectionTitle);

        section.settings.forEach((setting) => {
          const row = document.createElement("div");
          row.className = "fp-settings-row";

          const label = document.createElement("span");
          label.className = "fp-settings-label";
          label.textContent = setting.label;
          row.appendChild(label);

          const value = setting.get();

          if (setting.type === "toggle") {
            const toggle = document.createElement("button");
            toggle.className = `fp-toggle ${value ? "active" : ""}`;
            toggle.innerHTML = '<span class="fp-toggle-slider"></span>';
            toggle.onclick = () => {
              const newValue = !setting.get();
              setting.set(newValue);
              saveSettings();
              toggle.classList.toggle("active", newValue);
            };
            row.appendChild(toggle);
          } else if (setting.type === "select" && setting.options) {
            const select = document.createElement("select");
            select.className = "fp-select";
            setting.options.forEach((opt: number) => {
              const option = document.createElement("option");
              option.value = opt.toString();
              option.textContent = setting.format ? setting.format(opt) : opt.toString();
              option.selected = opt === value;
              select.appendChild(option);
            });
            select.onchange = () => {
              setting.set(parseFloat(select.value));
              saveSettings();
            };
            row.appendChild(select);
          } else if (setting.type === "number") {
            const input = document.createElement("input");
            input.type = "number";
            input.className = "fp-input";
            input.value = value?.toString() || "";
            input.min = setting.min?.toString() || "";
            input.max = setting.max?.toString() || "";
            input.onchange = () => {
              setting.set(parseInt(input.value));
              saveSettings();
            };
            row.appendChild(input);
          }

          sectionEl.appendChild(row);
        });

        scrollArea.appendChild(sectionEl);
      });

      // Keyboard shortcuts section
      if (SETTINGS.keyboard.enabled) {
        const shortcutsSection = document.createElement("div");
        shortcutsSection.className = "fp-settings-section";

        const shortcutsTitle = document.createElement("h4");
        shortcutsTitle.textContent = "Shortcuts Reference";
        shortcutsSection.appendChild(shortcutsTitle);

        const shortcuts = [
          ["Space", "Play/Pause"],
          ["Left/Right", "Seek ±10s"],
          ["Shift + Left/Right", "Seek ±30s"],
          ["Up/Down", "Volume"],
          ["M", "Mute"],
          ["F", "Fullscreen"],
          ["T", "Theater Mode"],
          ["C", "Captions"],
          ["< / >", "Speed Down/Up"],
          ["N / P", "Next/Previous"],
          ["Q", "Toggle Queue"],
          ["A", "Add to Queue"],
          ["0-9", "Seek to %"],
        ];

        shortcuts.forEach(([key, desc]) => {
          const row = document.createElement("div");
          row.className = "fp-shortcut-row";

          const keyEl = document.createElement("kbd");
          keyEl.textContent = key ?? "";

          const descEl = document.createElement("span");
          descEl.textContent = desc ?? "";

          row.appendChild(keyEl);
          row.appendChild(descEl);
          shortcutsSection.appendChild(row);
        });

        scrollArea.appendChild(shortcutsSection);
      }

      container.appendChild(scrollArea);
    };

    // ===== VIDEO INFO EXTRACTION =====
    const getPostIdFromUrl = (): string | null => {
      const match = window.location.pathname.match(/\/post\/([^/]+)/);
      return match?.[1] ?? null;
    };

    const getCurrentVideoInfo = (): QueueVideo | null => {
      const postId = getPostIdFromUrl();
      if (!postId) return null;

      const titleEl = document.querySelector("h1");
      const title = titleEl?.innerText || document.title.replace("Floatplane - ", "").trim();

      let thumbnail = "";
      const metaImg = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
      if (metaImg) thumbnail = metaImg.content;

      let duration = "";
      let durationSeconds = 0;
      const video = document.querySelector("video");
      if (video && video.duration) {
        durationSeconds = Math.floor(video.duration);
        duration = api.formatDuration(durationSeconds);
      }

      return {
        id: postId,
        url: window.location.href,
        title,
        thumbnail,
        duration,
        durationSeconds,
      };
    };

    // ===== AUTO-ADD FEATURE =====
    const checkAutoAdd = (): void => {
      if (!SETTINGS.queue.autoAddCurrentVideo) return;
      if (STATE.queue.length === 0) return;

      const postId = getPostIdFromUrl();
      if (!postId) return;

      const existingIdx = STATE.queue.findIndex((v) => v.id === postId);
      if (existingIdx !== -1) {
        if (STATE.currentIndex !== existingIdx) {
          STATE.currentIndex = existingIdx;
          saveQueue();
        }
        return;
      }

      const attemptAdd = (retries = 3): void => {
        const videoInfo = getCurrentVideoInfo();
        if (!videoInfo || !videoInfo.title) {
          if (retries > 0) setTimeout(() => attemptAdd(retries - 1), 1000);
          return;
        }

        addToQueue(videoInfo, { silent: true, setAsCurrent: true });
      };

      attemptAdd();
    };

    // ===== VIDEO LINK INJECTION =====
    const extractVideoInfo = (anchor: HTMLAnchorElement, container: Element): QueueVideo | null => {
      const url = anchor.href;
      const id = url.split("/post/")[1];
      if (!id) return null;

      let thumbnail = "";
      const img = container.querySelector("img");
      if (img) {
        thumbnail = img.src;
      } else {
        const allDivs = container.querySelectorAll("div");
        for (const div of allDivs) {
          const bgImage = div.style.backgroundImage;
          if (bgImage && bgImage !== "none") {
            thumbnail = bgImage.slice(5, -2);
            break;
          }
        }
      }

      let title = "Unknown Video";
      const allLinks = container.querySelectorAll<HTMLAnchorElement>(`a[href*="${id}"]`);
      for (const link of allLinks) {
        if (link.querySelector("img") || link.querySelector('[style*="background-image"]'))
          continue;
        const linkText = link.innerText.trim();
        if (
          linkText.length > 1 &&
          !/^\d+:\d+$/.test(linkText) &&
          !linkText.startsWith("Duration:")
        ) {
          title = linkText;
          break;
        }
      }

      if (title === "Unknown Video") {
        const titleEl = container.querySelector(
          'h1, h2, h3, h4, [class*="title"], [class*="Title"]',
        );
        if (titleEl?.textContent) {
          const titleText = titleEl.textContent.trim();
          if (!/^\d+:\d+$/.test(titleText) && !titleText.startsWith("Duration:")) {
            title = titleText;
          }
        }
      }

      let duration = "";
      let durationSeconds = 0;
      const durationEl =
        container.querySelector('[class*="duration"]') ||
        container.querySelector('[class*="Duration"]') ||
        anchor.querySelector('[class*="duration"]') ||
        anchor.querySelector('[class*="Duration"]');

      if (durationEl?.textContent) {
        const text = durationEl.textContent.trim();
        if (/^\d+:\d+(:\d+)?$/.test(text)) {
          duration = text;
          const parts = text.split(":").map(Number);
          const [first = 0, second = 0, third = 0] = parts;
          if (parts.length === 3) {
            durationSeconds = first * 3600 + second * 60 + third;
          } else {
            durationSeconds = first * 60 + second;
          }
        }
      }

      let subchannel = "";
      const subchannelEl =
        container.querySelector('a[class*="channelName"]') ||
        container.querySelector('[class*="channelName"]');
      if (subchannelEl?.textContent) {
        subchannel = subchannelEl.textContent.trim();
      }

      return { id, url, title, thumbnail, duration, durationSeconds, subchannel };
    };

    const processVideoLinks = (): void => {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/post/"]');
      const processedIds = new Set<string>();

      links.forEach((anchor) => {
        const videoId = anchor.href.split("/post/")[1];
        if (!videoId || processedIds.has(videoId)) return;

        const hasImage =
          anchor.querySelector("img") || anchor.querySelector('[style*="background-image"]');
        if (!hasImage) return;

        processedIds.add(videoId);

        let container: HTMLElement = anchor;
        if (window.getComputedStyle(anchor).position === "static") {
          container = anchor.closest("div") || anchor;
        }

        if (container.dataset.fpQueueProcessed) return;

        container.dataset.fpQueueProcessed = "true";
        container.style.position = "relative";

        // Add to queue button
        const addBtn = document.createElement("div");
        addBtn.className = "fp-queue-add-btn";
        addBtn.appendChild(createIcon("plus", 16));
        addBtn.title = "Add to Queue";

        addBtn.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };

        addBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const tileContainer = anchor.closest('div[class*="Tile"]') || anchor.closest("div");
          const video = extractVideoInfo(anchor, tileContainer ?? anchor);
          if (!video) return false;

          addToQueue(video);
          addBtn.classList.add("added");
          setTimeout(() => addBtn.classList.remove("added"), 1000);
          return false;
        };

        // Play next button
        const nextBtn = document.createElement("div");
        nextBtn.className = "fp-queue-next-btn";
        nextBtn.appendChild(createIcon("next", 14));
        nextBtn.title = "Play Next";

        nextBtn.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };

        nextBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const tileContainer = anchor.closest('div[class*="Tile"]') || anchor.closest("div");
          const video = extractVideoInfo(anchor, tileContainer ?? anchor);
          if (!video) return false;

          addToQueue(video, { position: "next" });
          showNotification(`Playing next: ${video.title}`);
          nextBtn.classList.add("added");
          setTimeout(() => nextBtn.classList.remove("added"), 1000);
          return false;
        };

        container.appendChild(addBtn);
        container.appendChild(nextBtn);
      });
    };

    const startObserver = (): void => {
      let timeout: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          processVideoLinks();
          if (!playerControlsInjected) {
            injectPlayerControls();
          }
        }, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      processVideoLinks();
    };

    // ===== NAVIGATION =====
    const playNext = (): void => {
      if (STATE.queue.length === 0) {
        showNotification("Queue is empty");
        return;
      }

      let nextIndex = STATE.currentIndex + 1;

      if (STATE.shuffleEnabled) {
        nextIndex = Math.floor(Math.random() * STATE.queue.length);
      }

      if (nextIndex >= STATE.queue.length) {
        if (STATE.repeatMode === "all") {
          nextIndex = 0;
        } else {
          showNotification("End of queue");
          return;
        }
      }

      const nextVideo = STATE.queue[nextIndex];
      if (!nextVideo) return;
      STATE.currentIndex = nextIndex;
      saveQueue();
      window.location.href = nextVideo.url;
    };

    const playPrevious = (): void => {
      if (STATE.queue.length === 0) {
        showNotification("Queue is empty");
        return;
      }

      let prevIndex = STATE.currentIndex - 1;
      if (prevIndex < 0) {
        if (STATE.repeatMode === "all") {
          prevIndex = STATE.queue.length - 1;
        } else {
          showNotification("Beginning of queue");
          return;
        }
      }

      const previousVideo = STATE.queue[prevIndex];
      if (!previousVideo) return;
      STATE.currentIndex = prevIndex;
      saveQueue();
      window.location.href = previousVideo.url;
    };

    // ===== AUTOPLAY =====
    const tryAutoPlayVideo = (): void => {
      if (!STATE.contextValid || !SETTINGS.player.autoplay) return;

      const postId = getPostIdFromUrl();
      if (!postId) return;
      if (STATE.queue.length === 0) return;

      const attemptPlay = (retries = 10): void => {
        if (!STATE.contextValid) return;
        const video = document.querySelector("video");
        if (video) {
          // Apply saved playback rate
          video.playbackRate = SETTINGS.player.playbackSpeed;
          video.volume = SETTINGS.player.volume;
          video.muted = SETTINGS.player.muted;

          video.play().catch((err) => {
            console.log("Autoplay blocked:", err);
            const playBtn =
              document.querySelector<HTMLElement>('[class*="play"]') ||
              document.querySelector<HTMLElement>('button[aria-label*="play"]') ||
              document.querySelector<HTMLElement>(".vjs-big-play-button");
            if (playBtn) playBtn.click();
          });
        } else if (retries > 0) {
          setTimeout(() => attemptPlay(retries - 1), 500);
        }
      };

      setTimeout(() => attemptPlay(), 1000);
    };

    // ===== INITIALIZATION =====
    const init = async (): Promise<void> => {
      STATE.contextValid = true;

      await loadSettings();
      createMainPanel();
      await loadQueue();
      startObserver();
      setupKeyboardShortcuts();

      // Periodically check for video element
      const checkInterval = setInterval(() => {
        if (!STATE.contextValid) {
          clearInterval(checkInterval);
          return;
        }
        if (!playerControlsInjected) {
          injectPlayerControls();
        }
      }, 2000);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  },
});
