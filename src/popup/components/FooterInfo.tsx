import { Kbd } from '~/shared/components/ui/kbd';

export function FooterInfo() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground px-2 py-1.5 border-t">
      <div className="flex items-center gap-1.5">
        <Kbd>⌘K</Kbd>
        <span>Actions</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Kbd>⌘S</Kbd>
        <span>Start/Stop</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Kbd>Enter</Kbd>
        <span>Select</span>
      </div>
    </div>
  );
}
