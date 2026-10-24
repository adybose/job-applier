import { startContent } from '../content';

// Injected by the background with chrome.scripting when a run starts (ADR-002),
// so it is not listed in the manifest.
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  allFrames: true,
  main() {
    startContent();
  },
});
