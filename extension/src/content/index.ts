// Content script logic: FormSnapshot (T06) and actions (T07) live here.
export function startContent(): void {
  document.documentElement.dataset.lazyapplyReady = 'true';
}
