import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge, makeStyles, tokens, Text } from '@fluentui/react-components';
import { GripVertical, ImageIcon, ChevronUp, ChevronDown } from 'lucide-react';
import type { Evidence } from '@cs/domain';

/* Keyboard-reorderable EVA photo-order list (@dnd-kit/sortable).

   Seeds the EVA order per the photo-order rule:
     2 previews first — [overview-with-registration, then damage_closeup] —
     then ALL accepted images in sequence, INCLUDING those two again.
   An aria-live region announces reorders. */

export interface ImageOrderEntry {
  /** Unique within the list (a preview duplicate gets a distinct key). */
  key: string;
  evidence: Evidence;
  /** True for the two leading preview slots. */
  isPreview: boolean;
  previewLabel?: 'Overview' | 'Damage closeup';
}

/** Build the seeded EVA order from a case's accepted images. */
export function buildEvaImageOrder(images: Evidence[]): ImageOrderEntry[] {
  const accepted = images.filter((e) => e.acceptedForEva && !e.excluded);
  const overview = accepted.find((e) => e.imageRole === 'overview' && e.registrationVisible);
  const closeup = accepted.find((e) => e.imageRole === 'damage_closeup');

  const previews: ImageOrderEntry[] = [];
  if (overview) previews.push({ key: `preview-${overview.id}`, evidence: overview, isPreview: true, previewLabel: 'Overview' });
  if (closeup) previews.push({ key: `preview-${closeup.id}`, evidence: closeup, isPreview: true, previewLabel: 'Damage closeup' });

  const all: ImageOrderEntry[] = accepted.map((e) => ({
    key: `all-${e.id}`,
    evidence: e,
    isPreview: false,
  }));

  return [...previews, ...all];
}

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS + ' ' + tokens.spacingHorizontalS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  grip: {
    cursor: 'grab',
    display: 'inline-flex',
    color: tokens.colorNeutralForeground3,
    background: 'none',
    border: 0,
    padding: '2px',
    borderRadius: '2px',
    // CE red 3px focus halo when the handle is focused for arrow-key reorder.
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219, 8, 22, 0.55)',
    },
  },
  // vertical Move up / Move down control stack.
  moveStack: {
    display: 'inline-flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  moveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '14px',
    padding: 0,
    background: 'none',
    border: 0,
    borderRadius: '2px',
    color: tokens.colorNeutralForeground3,
    cursor: 'pointer',
    ':hover': { color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground3 },
    ':disabled': { color: tokens.colorNeutralForegroundDisabled, cursor: 'default', backgroundColor: 'transparent' },
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219, 8, 22, 0.55)',
      zIndex: 1,
    },
  },
  thumb: {
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadiusSmall,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    flexShrink: 0,
  },
  idx: { width: '20px', textAlign: 'right', color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  name: { flex: 1, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

interface SortableRowProps {
  entry: ImageOrderEntry;
  index: number;
  total: number;
  onMove: (index: number, dir: -1 | 1) => void;
}

function SortableRow({ entry, index, total, onMove }: SortableRowProps) {
  const styles = useStyles();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const canUp = index > 0;
  const canDown = index < total - 1;
  const pos = `position ${index + 1} of ${total}`;

  // Arrow-key reorder while the grip is focused (in addition to the dnd-kit
  // space-to-lift flow and the explicit Move up/down buttons).
  const onGripKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowUp' && canUp) {
      e.preventDefault();
      onMove(index, -1);
    } else if (e.key === 'ArrowDown' && canDown) {
      e.preventDefault();
      onMove(index, 1);
    }
  };

  return (
    <li ref={setNodeRef} style={style} className={styles.row}>
      <button
        type="button"
        className={styles.grip}
        aria-label={`Reorder ${entry.evidence.fileName}, ${pos}. Press the arrow keys to move.`}
        onKeyDown={onGripKeyDown}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className={styles.moveStack}>
        <button
          type="button"
          className={styles.moveBtn}
          aria-label={`Move ${entry.evidence.fileName} up`}
          disabled={!canUp}
          onClick={() => onMove(index, -1)}
        >
          <ChevronUp size={13} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className={styles.moveBtn}
          aria-label={`Move ${entry.evidence.fileName} down`}
          disabled={!canDown}
          onClick={() => onMove(index, 1)}
        >
          <ChevronDown size={13} strokeWidth={2.5} />
        </button>
      </span>
      <span className={styles.idx}>{index + 1}</span>
      <span className={styles.thumb} style={{ backgroundColor: entry.evidence.thumbColor ?? '#777' }}>
        <ImageIcon size={14} />
      </span>
      <Text className={styles.name}>{entry.evidence.fileName}</Text>
      {entry.isPreview && (
        <Badge appearance="tint" color="brand" size="small" shape="rounded">
          Preview · {entry.previewLabel}
        </Badge>
      )}
    </li>
  );
}

export interface ImageOrderListProps {
  /** Accepted images for the case; the seed order is built internally. */
  images: Evidence[];
  /** Notified with the current key order on every reorder. */
  onOrderChange?: (orderedKeys: string[]) => void;
}

/** Drag/keyboard-reorderable EVA photo-order list with an aria-live region. */
export function ImageOrderList({ images, onOrderChange }: ImageOrderListProps) {
  const styles = useStyles();
  const seed = useMemo(() => buildEvaImageOrder(images), [images]);
  const [entries, setEntries] = useState<ImageOrderEntry[]>(seed);
  const [announcement, setAnnouncement] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Shared reorder applied by both the buttons and arrow keys. */
  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    setEntries((items) => {
      if (to < 0 || to >= items.length) return items;
      const next = arrayMove(items, from, to);
      onOrderChange?.(next.map((i) => i.key));
      setAnnouncement(
        `${next[to].evidence.fileName} moved to position ${to + 1} of ${next.length}.`,
      );
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEntries((items) => {
      const oldIndex = items.findIndex((i) => i.key === active.id);
      const newIndex = items.findIndex((i) => i.key === over.id);
      const next = arrayMove(items, oldIndex, newIndex);
      onOrderChange?.(next.map((i) => i.key));
      setAnnouncement(
        `${next[newIndex].evidence.fileName} moved to position ${newIndex + 1} of ${next.length}.`,
      );
      return next;
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={entries.map((e) => e.key)} strategy={verticalListSortingStrategy}>
        <ol className={styles.list}>
          {entries.map((entry, i) => (
            <SortableRow key={entry.key} entry={entry} index={i} total={entries.length} onMove={move} />
          ))}
        </ol>
      </SortableContext>
      <div aria-live="polite" className={styles.srOnly}>
        {announcement}
      </div>
    </DndContext>
  );
}
