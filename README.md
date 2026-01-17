# Floatplane Queue - WXT Edition

A cross-browser extension that adds video queueing functionality to Floatplane, built with [WXT](https://wxt.dev/) for maximum compatibility and modern development experience.

## Features

- **Queue Management**: Add videos to your queue directly from video thumbnails with hover-to-reveal add buttons
- **Drag & Drop Reordering**: Organize your queue by dragging items to rearrange them
- **Automatic Playback**: Auto-plays the next video when the current one ends
- **Queue Navigation**: Navigate forward and backward through your queue with intuitive controls
- **Persistent Storage**: Your queue is saved and persists across browser sessions
- **Auto-Add Detection**: Automatically adds the currently watching video to your queue
- **Cross-Browser Support**: Works on Chrome, Firefox, Edge, and other browsers

## Browser Compatibility

Built with WXT, this extension works across:
- Chrome/Chromium
- Firefox
- Edge
- Safari (with potential adjustments)
- Opera
- Brave

## Development

### Prerequisites

- Node.js 18+ and npm/pnpm/yarn

### Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
# Chrome (default)
npm run dev

# Firefox
npm run dev:firefox

# Edge
npm run dev:edge
```

3. The extension will be automatically loaded in your browser with hot module reloading enabled.

### Building for Production

Build for all browsers:
```bash
npm run build
```

Build for specific browsers:
```bash
npm run build:chrome
npm run build:firefox
npm run build:edge
```

Create distribution packages:
```bash
npm run zip          # All browsers
npm run zip:chrome   # Chrome only
npm run zip:firefox  # Firefox only
npm run zip:edge     # Edge only
```

The built extensions will be in `.output/` directory.

## Project Structure

```
wxt-extension/
├── entrypoints/
│   ├── background.ts       # Background service worker
│   ├── content.ts          # Main content script (TypeScript)
│   └── content.css         # Content script styles
├── public/
│   └── icons/              # Extension icons
├── wxt.config.ts           # WXT configuration
├── tsconfig.json           # TypeScript configuration
└── package.json
```

## WXT Benefits

- **TypeScript First**: Full type safety and IntelliSense support
- **Auto-reload**: Changes reload instantly during development
- **Cross-browser**: Single codebase works on all major browsers
- **Modern Tooling**: Built on Vite for fast builds
- **Type-safe APIs**: Uses `webextension-polyfill` for consistent APIs

## Usage

### Adding Videos to Queue

1. Navigate to any Floatplane page with video thumbnails
2. Hover over a video thumbnail to reveal the add button (+)
3. Click the button to add the video to your queue

### Managing Your Queue

- **Open Queue**: Click the Queue button in the bottom right corner
- **Play Video**: Click any item in the queue to jump to that video
- **Reorder**: Drag and drop items to reorder them
- **Remove**: Click the × button on any item to remove it
- **Clear All**: Click "Clear" to empty the entire queue
- **Navigate**: Use ◀ and ▶ buttons to play previous/next videos

### Auto-Play

When a video finishes playing, the extension will automatically:
1. Show a notification with the next video's title
2. Wait 1.5 seconds
3. Navigate to the next video in your queue

## License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.
