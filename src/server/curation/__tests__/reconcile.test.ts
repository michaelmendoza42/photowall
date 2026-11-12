import { describe, expect, it } from 'vitest';
import { photoIdFromPath } from '../../scanner/walk.js';
import { planReconcile, type CurationState, type FileFingerprint } from '../reconcile.js';

const fp = (size: number, mtimeMs = 1000): FileFingerprint => ({ size, mtimeMs });
const index = (entries: Record<string, FileFingerprint>) => new Map(Object.entries(entries));
const allSame = async () => true;
const allDifferent = async () => false;

function state(partial: Partial<CurationState>): CurationState {
  return { starred: new Set(), private: new Set(), edits: {}, onDisplay: [], defaultView: [], shares: [], ...partial };
}

describe('planReconcile', () => {
  it('moves stars, private flags and edits to a renamed folder', async () => {
    const plan = await planReconcile({
      state: state({
        starred: new Set(['2019/Gem/a.jpg']),
        private: new Set(['2019/Gem/b.jpg']),
        edits: { '2019/Gem/a.jpg': { crop: 1 } },
        onDisplay: ['2019/Gem'],
      }),
      previous: index({ '2019/Gem/a.jpg': fp(10), '2019/Gem/b.jpg': fp(20) }),
      current: index({ '2019/Gem Lake/a.jpg': fp(10), '2019/Gem Lake/b.jpg': fp(20) }),
      sameContent: allDifferent,
    });
    expect([...plan.next.starred]).toEqual(['2019/Gem Lake/a.jpg']);
    expect([...plan.next.private]).toEqual(['2019/Gem Lake/b.jpg']);
    expect(plan.next.edits).toEqual({ '2019/Gem Lake/a.jpg': { crop: 1 } });
    expect(plan.next.onDisplay).toEqual(['2019/Gem Lake']);
  });

  it('leaves entries alone when their file is still there', async () => {
    const plan = await planReconcile({
      state: state({ starred: new Set(['a/x.jpg']) }),
      previous: index({ 'a/x.jpg': fp(1) }),
      current: index({ 'a/x.jpg': fp(1), 'b/x.jpg': fp(1) }),
      sameContent: allSame,
    });
    expect(plan.photos.size).toBe(0);
    expect([...plan.next.starred]).toEqual(['a/x.jpg']);
  });

  it('uses the old size to pick between files sharing a name', async () => {
    const plan = await planReconcile({
      state: state({ starred: new Set(['old/DSC1.JPG']) }),
      previous: index({ 'old/DSC1.JPG': fp(500) }),
      current: index({ '2018/DSC1.JPG': fp(400), '2019/DSC1.JPG': fp(500) }),
      sameContent: allDifferent,
    });
    expect([...plan.next.starred]).toEqual(['2019/DSC1.JPG']);
  });

  it('gives every byte-identical copy the entry', async () => {
    const plan = await planReconcile({
      state: state({ starred: new Set(['old/x.jpg']), edits: { 'old/x.jpg': 'e' } }),
      previous: index({}),
      current: index({ 'a/x.jpg': fp(1), 'b/x.jpg': fp(1) }),
      sameContent: allSame,
    });
    expect([...plan.next.starred].sort()).toEqual(['a/x.jpg', 'b/x.jpg']);
    expect(plan.next.edits).toEqual({ 'a/x.jpg': 'e', 'b/x.jpg': 'e' });
  });

  it('keeps an entry on its old path when the match is ambiguous', async () => {
    const plan = await planReconcile({
      state: state({ starred: new Set(['old/x.jpg']) }),
      previous: index({}),
      current: index({ 'a/x.jpg': fp(1), 'b/x.jpg': fp(2) }),
      sameContent: allDifferent,
    });
    expect(plan.photos.get('old/x.jpg')).toEqual({ kind: 'ambiguous', candidates: ['a/x.jpg', 'b/x.jpg'] });
    expect([...plan.next.starred]).toEqual(['old/x.jpg']);
  });

  it('keeps a deleted photo’s entry and reports it missing', async () => {
    const plan = await planReconcile({
      state: state({ edits: { 'gone/x.jpg': 'e' } }),
      previous: index({ 'gone/x.jpg': fp(1) }),
      current: index({}),
      sameContent: allSame,
    });
    expect(plan.photos.get('gone/x.jpg')).toEqual({ kind: 'missing' });
    expect(plan.next.edits).toEqual({ 'gone/x.jpg': 'e' });
  });

  it('follows a renamed file by size and mtime', async () => {
    const plan = await planReconcile({
      state: state({ starred: new Set(['a/IMG_1.jpg']) }),
      previous: index({ 'a/IMG_1.jpg': fp(77, 5000.4) }),
      current: index({ 'b/sunset.jpg': fp(77, 5000.9) }),
      sameContent: allDifferent,
    });
    expect([...plan.next.starred]).toEqual(['b/sunset.jpg']);
  });

  it('never overwrites an edit already at the new path', async () => {
    const plan = await planReconcile({
      state: state({ edits: { 'old/x.jpg': 'old', 'new/x.jpg': 'new' } }),
      previous: index({ 'old/x.jpg': fp(1) }),
      current: index({ 'new/x.jpg': fp(1) }),
      sameContent: allSame,
    });
    expect(plan.next.edits).toEqual({ 'new/x.jpg': 'new', 'old/x.jpg': 'old' });
    expect(plan.editConflicts).toEqual([{ from: 'old/x.jpg', to: 'new/x.jpg' }]);
  });

  it('does not map a folder whose photos were split up', async () => {
    const plan = await planReconcile({
      state: state({ onDisplay: ['trip'] }),
      previous: index({ 'trip/a.jpg': fp(1), 'trip/b.jpg': fp(2) }),
      current: index({ 'x/a.jpg': fp(1), 'y/b.jpg': fp(2) }),
      sameContent: allDifferent,
    });
    expect(plan.folders.get('trip')).toEqual({ kind: 'ambiguous', candidates: ['x', 'y'] });
    expect(plan.next.onDisplay).toEqual(['trip']);
  });

  it('remaps share folders and anchor photo', async () => {
    const plan = await planReconcile({
      state: state({
        shares: [{ id: 's1', folders: ['trip'], excludeFolders: [], anchorPhotoId: photoIdFromPath('trip/a.jpg') }],
      }),
      previous: index({ 'trip/a.jpg': fp(1) }),
      current: index({ '2020/trip/a.jpg': fp(1) }),
      sameContent: allDifferent,
    });
    expect(plan.next.shares[0]).toMatchObject({
      folders: ['2020/trip'],
      anchorPhotoId: photoIdFromPath('2020/trip/a.jpg'),
    });
  });
});
