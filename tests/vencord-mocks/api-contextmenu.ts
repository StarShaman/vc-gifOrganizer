/*
 * Minimal stand-in for Vencord's "@api/ContextMenu".
 */

export type NavContextMenuPatchCallback = (children: any[], props: any) => void;

export function findGroupChildrenByChildId(_id: string, _children: any[]): any[] | undefined {
    return undefined;
}
