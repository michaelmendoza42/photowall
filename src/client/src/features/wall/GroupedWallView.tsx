import { WallCanvas, type WallCanvasProps } from './WallCanvas.js';
import type { GroupedWallFoundation } from './groupedWall.js';

export interface GroupedWallViewProps
  extends Omit<WallCanvasProps, 'groupedFoundation' | 'activeAlbumAreaCount'> {
  groupedFoundation: GroupedWallFoundation;
  activeAlbumAreaCount?: number;
}

export function GroupedWallView(props: GroupedWallViewProps): JSX.Element {
  const { groupedFoundation, activeAlbumAreaCount = 1, ...sharedProps } = props;

  return (
    <WallCanvas
      {...sharedProps}
      groupedFoundation={groupedFoundation}
      activeAlbumAreaCount={activeAlbumAreaCount}
      signpostsEnabled
    />
  );
}
