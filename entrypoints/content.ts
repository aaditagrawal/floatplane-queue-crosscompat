import "../assets/content-styles.css";

export default defineContentScript({
  matches: ["*://*.floatplane.com/*"],
  runAt: "document_end",
  cssInjectionMode: "ui",

  async main() {
    // Types
    interface Video {
      id: string;
      title: string;
      url: string;
      thumbnail: string;
      duration: string;
      subchannel?: string;
    }

    interface QueueState {
      queue: Video[];
      currentIndex: number;
      isOpen: boolean;
      contextValid: boolean;
    }

    // State
    const STATE: QueueState = {
      queue: [],
      currentIndex: -1,
      isOpen: false,
      contextValid: true,
    };

    // --- Storage ---
    const loadQueue = async (): Promise<void> => {
      try {
        const result = await browser.storage.local.get(["fp_queue", "fp_queue_index"]);
        // `browser.storage.local.get` hands back `unknown` values, so check the
        // shape here rather than trusting it. Both keys are written only by
        // `saveQueue` below, but storage survives extension upgrades.
        const storedQueue = result.fp_queue;
        const storedIndex = result.fp_queue_index;
        STATE.queue = Array.isArray(storedQueue) ? storedQueue : [];
        STATE.currentIndex = Number.isInteger(storedIndex) ? Number(storedIndex) : -1;
        updateContainerVisibility();
        renderQueue();
        checkAutoAdd();
        tryAutoPlayVideo();
      } catch {
        STATE.contextValid = false;
        // Silent - extension was reloaded, user should refresh
      }
    };

    const saveQueue = async (): Promise<void> => {
      try {
        await browser.storage.local.set({
          fp_queue: STATE.queue,
          fp_queue_index: STATE.currentIndex,
        });
        updateContainerVisibility();
        renderQueue();
      } catch {
        STATE.contextValid = false;
        // Silent - extension was reloaded, user should refresh
      }
    };

    const updateContainerVisibility = (): void => {
      const container = document.getElementById("fp-queue-container");
      if (container) {
        if (STATE.queue.length === 0) {
          container.style.display = "none";
          STATE.isOpen = false;
          container.classList.add("fp-queue-collapsed");
        } else {
          container.style.display = "flex";
        }
      }
    };

    interface AddToQueueOptions {
      silent?: boolean;
      setAsCurrent?: boolean;
    }

    const addToQueue = (video: Video, options: AddToQueueOptions = {}): void => {
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
        STATE.queue.push(video);
        if (options.setAsCurrent) {
          STATE.currentIndex = STATE.queue.length - 1;
        }
        saveQueue();
        updateContainerVisibility();
        if (!options.silent) showNotification(`Added to Queue: ${video.title}`);
      }
    };

    const removeFromQueue = (index: number): void => {
      STATE.queue.splice(index, 1);
      // Adjust currentIndex if needed
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
    };

    // --- UI Components ---
    const showNotification = (msg: string): void => {
      let notif = document.getElementById("fp-queue-notification");
      if (!notif) {
        notif = document.createElement("div");
        notif.id = "fp-queue-notification";
        document.body.appendChild(notif);
      }
      notif.textContent = msg;
      notif.classList.add("show");
      setTimeout(() => {
        notif?.classList.remove("show");
      }, 3000);
    };

    const createQueuePanel = (): void => {
      if (document.getElementById("fp-queue-container")) return;

      const container = document.createElement("div");
      container.id = "fp-queue-container";
      container.className = "fp-queue-glass fp-queue-collapsed";
      container.style.display = "none";

      const toggleBtn = document.createElement("div");
      toggleBtn.id = "fp-queue-toggle";
      toggleBtn.innerHTML = `
        <div class="fp-queue-toggle-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
          <span>Queue</span>
        </div>
        <span id="fp-queue-count" class="fp-queue-badge">0/0</span>
      `;
      toggleBtn.onclick = () => {
        container.classList.toggle("fp-queue-collapsed");
        STATE.isOpen = !container.classList.contains("fp-queue-collapsed");
      };

      const content = document.createElement("div");
      content.id = "fp-queue-content";

      const header = document.createElement("div");
      header.className = "fp-queue-header";
      header.innerHTML = "<h3>Up Next</h3>";

      const navBtns = document.createElement("div");
      navBtns.className = "fp-queue-nav-btns";

      const prevBtn = document.createElement("button");
      prevBtn.className = "fp-queue-nav-btn";
      prevBtn.innerHTML = "◀";
      prevBtn.title = "Previous";
      prevBtn.onclick = playPrevious;

      const nextBtn = document.createElement("button");
      nextBtn.className = "fp-queue-nav-btn";
      nextBtn.innerHTML = "▶";
      nextBtn.title = "Next";
      nextBtn.onclick = playNext;

      const clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.className = "fp-queue-text-btn";
      clearBtn.onclick = clearQueue;

      navBtns.appendChild(prevBtn);
      navBtns.appendChild(nextBtn);
      navBtns.appendChild(clearBtn);
      header.appendChild(navBtns);

      const list = document.createElement("div");
      list.id = "fp-queue-list";

      content.appendChild(header);
      content.appendChild(list);
      container.appendChild(toggleBtn);
      container.appendChild(content);

      document.body.appendChild(container);
    };

    const renderQueue = (): void => {
      const countEl = document.getElementById("fp-queue-count");
      const total = STATE.queue.length;
      const currentPos = STATE.currentIndex >= 0 ? STATE.currentIndex + 1 : "-";
      if (countEl) countEl.textContent = `${currentPos}/${total}`;

      const list = document.getElementById("fp-queue-list");
      if (!list) return;

      list.innerHTML = "";
      STATE.queue.forEach((video, index) => {
        const isCurrent = index === STATE.currentIndex;
        const item = document.createElement("div");
        item.className = `fp-queue-item ${isCurrent ? "current" : ""}`;
        item.draggable = true;

        item.ondragstart = (e) => {
          e.dataTransfer?.setData("text/plain", index.toString());
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          item.classList.add("dragging");
        };
        item.ondragend = () => {
          item.classList.remove("dragging");
        };
        item.ondragover = (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        };
        item.ondrop = (e) => {
          e.preventDefault();
          const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") || "0");
          const toIndex = index;
          if (fromIndex !== toIndex) {
            const movedItem = STATE.queue.splice(fromIndex, 1)[0];
            if (!movedItem) return;
            STATE.queue.splice(toIndex, 0, movedItem);
            // Update currentIndex if affected
            if (STATE.currentIndex === fromIndex) {
              STATE.currentIndex = toIndex;
            } else if (fromIndex < STATE.currentIndex && toIndex >= STATE.currentIndex) {
              STATE.currentIndex--;
            } else if (fromIndex > STATE.currentIndex && toIndex <= STATE.currentIndex) {
              STATE.currentIndex++;
            }
            saveQueue();
          }
        };

        const rank = index + 1;
        const durationText = video.duration || "";
        const titleText = video.title || "Unknown Video";
        const subchannelText = video.subchannel || "";

        let metaParts: string[] = [];
        if (subchannelText) metaParts.push(subchannelText);
        if (durationText) metaParts.push(durationText);
        const metaLine = metaParts.join(" • ");

        item.innerHTML = `
          <div class="fp-queue-item-thumb" style="background-image: url('${video.thumbnail}')">
            ${isCurrent ? '<div class="fp-queue-playing-indicator">▶</div>' : ""}
          </div>
          <div class="fp-queue-item-info">
            <div class="fp-queue-item-title"><span class="fp-queue-rank">${rank}.</span> ${titleText}</div>
            <div class="fp-queue-item-meta">${metaLine}</div>
          </div>
          <div class="fp-queue-actions">
            <button class="fp-queue-remove" title="Remove">×</button>
          </div>
        `;

        item.onclick = (e) => {
          const clicked = e.target;
          if (clicked instanceof Element && clicked.closest(".fp-queue-remove")) return;
          STATE.currentIndex = index;
          saveQueue();
          window.location.href = video.url;
        };

        item.querySelector(".fp-queue-remove")!.addEventListener("click", (e) => {
          e.stopPropagation();
          removeFromQueue(index);
        });

        list.appendChild(item);
      });
    };

    // --- Auto-Add Feature ---
    const checkAutoAdd = (): void => {
      if (STATE.queue.length === 0) return;

      const path = window.location.pathname;
      if (!path.startsWith("/post/")) return;

      const id = path.slice("/post/".length);

      const existingIdx = STATE.queue.findIndex((v) => v.id === id);
      if (existingIdx !== -1) {
        if (STATE.currentIndex !== existingIdx) {
          STATE.currentIndex = existingIdx;
          saveQueue();
        }
        return;
      }

      const attemptAdd = (retries = 3): void => {
        const titleEl = document.querySelector("h1");
        const title = titleEl?.innerText || document.title;

        let thumbnail = "";
        const metaImg = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
        if (metaImg) thumbnail = metaImg.content;

        if (!title || title.length === 0) {
          if (retries > 0) setTimeout(() => attemptAdd(retries - 1), 1000);
          return;
        }

        const video: Video = {
          id,
          url: window.location.href,
          title: title.replace("Floatplane - ", "").trim(),
          thumbnail,
          duration: "",
        };

        console.log("Auto-adding current video:", video);
        addToQueue(video, { silent: true, setAsCurrent: true });
      };

      attemptAdd();
    };

    // --- Injection Logic ---
    const extractVideoInfo = (anchor: HTMLAnchorElement, container: Element): Video => {
      const url = anchor.href;
      const id = url.split("/post/")[1] ?? "";

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
        if (titleEl && titleEl.textContent) {
          const titleText = titleEl.textContent.trim();
          if (!/^\d+:\d+$/.test(titleText) && !titleText.startsWith("Duration:")) {
            title = titleText;
          }
        }
      }

      let duration = "";
      const durationEl =
        container.querySelector('[class*="duration"]') ||
        container.querySelector('[class*="Duration"]') ||
        anchor.querySelector('[class*="duration"]') ||
        anchor.querySelector('[class*="Duration"]');

      if (durationEl?.textContent) {
        const text = durationEl.textContent.trim();
        if (/^\d+:\d+(:\d+)?$/.test(text)) {
          duration = text;
        } else if (/Duration:\s*(\d+:\d+(:\d+)?)/.test(text)) {
          const match = text.match(/Duration:\s*(\d+:\d+(:\d+)?)/);
          if (match?.[1]) duration = match[1];
        }
      }

      let subchannel = "";
      const subchannelEl =
        container.querySelector('a[class*="channelName"]') ||
        container.querySelector('[class*="channelName"]');
      if (subchannelEl?.textContent) {
        subchannel = subchannelEl.textContent.trim();
      }

      return { id, url, title, thumbnail, duration, subchannel };
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

        const btn = document.createElement("div");
        btn.className = "fp-queue-add-btn";
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        `;
        btn.title = "Add to Queue";
        btn.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const tileContainer = anchor.closest('div[class*="Tile"]') || anchor.closest("div");
          const video = extractVideoInfo(anchor, tileContainer!);

          console.log("Adding video:", video);
          addToQueue(video);

          btn.classList.add("added");
          setTimeout(() => btn.classList.remove("added"), 1000);
          return false;
        };

        container.appendChild(btn);
      });
    };

    const startObserver = (): void => {
      let timeout: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(processVideoLinks, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      processVideoLinks();
    };

    // --- Navigation ---
    const playNext = (): void => {
      if (STATE.queue.length === 0) {
        showNotification("Queue is empty");
        return;
      }

      const nextIndex = STATE.currentIndex + 1;
      const nextVideo = STATE.queue[nextIndex];
      if (nextVideo) {
        STATE.currentIndex = nextIndex;
        saveQueue();
        window.location.href = nextVideo.url;
      } else {
        showNotification("End of queue");
      }
    };

    const playPrevious = (): void => {
      if (STATE.queue.length === 0) {
        showNotification("Queue is empty");
        return;
      }

      const prevIndex = STATE.currentIndex - 1;
      const previousVideo = STATE.queue[prevIndex];
      if (previousVideo) {
        STATE.currentIndex = prevIndex;
        saveQueue();
        window.location.href = previousVideo.url;
      } else {
        showNotification("Beginning of queue");
      }
    };

    // --- Autoplay Logic ---
    const setupAutoplay = (): void => {
      if (!STATE.contextValid) return;

      const video = document.querySelector("video");
      if (!video || video.dataset.fpQueueAutoplay) return;

      video.dataset.fpQueueAutoplay = "true";

      video.addEventListener("ended", () => {
        if (!STATE.contextValid) return;
        console.log("Video ended.");
        loadQueue().then(() => {
          const nextIndex = STATE.currentIndex + 1;
          const nextVideo = STATE.queue[nextIndex];
          if (nextVideo) {
            console.log("Autoplaying next:", nextVideo.title);
            showNotification(`Up Next: ${nextVideo.title}`);
            setTimeout(() => {
              STATE.currentIndex = nextIndex;
              saveQueue();
              window.location.href = nextVideo.url;
            }, 1500);
          } else {
            showNotification("Queue complete!");
          }
        });
      });
    };

    // --- Auto-Play Video on Page Load ---
    const tryAutoPlayVideo = (): void => {
      if (!STATE.contextValid) return;
      const path = window.location.pathname;
      if (!path.startsWith("/post/")) return;
      if (STATE.queue.length === 0) return;

      const attemptPlay = (retries = 10): void => {
        if (!STATE.contextValid) return;
        const video = document.querySelector("video");
        if (video) {
          video
            .play()
            .then(() => {
              console.log("FP Queue: Auto-play triggered successfully");
            })
            .catch((err) => {
              console.log("FP Queue: Autoplay blocked, trying play button...", err);
              const playBtn =
                document.querySelector<HTMLElement>('[class*="play"]') ||
                document.querySelector<HTMLElement>('button[aria-label*="play"]') ||
                document.querySelector<HTMLElement>(".vjs-big-play-button") ||
                document.querySelector<HTMLElement>('[class*="PlayButton"]');
              if (playBtn) {
                playBtn.click();
              }
            });
        } else if (retries > 0) {
          setTimeout(() => attemptPlay(retries - 1), 500);
        }
      };

      setTimeout(() => attemptPlay(), 1000);
    };

    // Initialize
    let autoplayInterval: ReturnType<typeof setTimeout>;
    const init = (): void => {
      STATE.contextValid = true;
      createQueuePanel();
      loadQueue();
      startObserver();
      autoplayInterval = setInterval(() => {
        if (!STATE.contextValid) {
          clearInterval(autoplayInterval);
          return;
        }
        setupAutoplay();
      }, 2000);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  },
});
