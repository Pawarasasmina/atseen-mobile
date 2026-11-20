// Shared by lists and cards so newly mounted cards also stay quiet during a scroll.
let visible = true;
const listeners = new Set<() => void>();
function update(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener());
}
export const hideSeenArrows = () => update(false);
export const showSeenArrows = () => update(true);
export const seenArrowsVisible = () => visible;
export const subscribeSeenArrows = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
