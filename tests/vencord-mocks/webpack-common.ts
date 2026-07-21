/*
 * Minimal stand-in for Vencord's "@webpack/common". Only the members the plugin
 * imports are provided. FluxDispatcher and Toasts record their calls so tests
 * can assert on them; React is the real library so JSX-producing helpers work.
 */

import * as RealReact from "react";

export const React = RealReact;
export const useState = RealReact.useState;

export const dispatchedEvents: any[] = [];

export const FluxDispatcher = {
    dispatch(event: any) {
        dispatchedEvents.push(event);
    },
    subscribe() { },
    unsubscribe() { }
};

let toastId = 0;
export const shownToasts: any[] = [];

export const Toasts = {
    Type: { MESSAGE: 0, SUCCESS: 1, FAILURE: 2, CUSTOM: 3, CLIP: 4 },
    Position: { TOP: 0, BOTTOM: 1 },
    genId: () => ++toastId,
    show: (toast: any) => { shownToasts.push(toast); },
    pop: () => { }
};

export const ContextMenuApi = {
    openContextMenu: (..._args: unknown[]) => { },
    closeContextMenu: () => { }
};

/** test-only helper */
export function __resetWebpackMocks() {
    dispatchedEvents.length = 0;
    shownToasts.length = 0;
}

// Menu primitives are real (named) function components so JSX-producing helpers
// yield inspectable React elements (element.type.displayName / element.props).
const makeComponent = (name: string) => {
    const C = (props: any) => RealReact.createElement(RealReact.Fragment, null, props?.children);
    C.displayName = name;
    return C;
};

export const Menu = {
    Menu: makeComponent("Menu"),
    MenuItem: makeComponent("MenuItem"),
    MenuSeparator: makeComponent("MenuSeparator"),
    MenuGroup: makeComponent("MenuGroup")
};

export const Modal: any = {};
export const ConfirmModal: any = () => null;
export const TextInput: any = () => null;
export const openModal: any = () => { };
export const MessageStore: any = { getMessage: () => undefined };
