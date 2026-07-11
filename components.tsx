/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { ConfirmModal, ContextMenuApi, Menu, Modal, openModal, TextInput, useState } from "@webpack/common";

import {
    addGifToCategory, categoriesContaining, createCategory, deleteCategory,
    GifInput, removeGifFromCategory, renameCategory, sortedCategories
} from "./store";
import { TileInstance } from "./types";

function closeMenu() {
    ContextMenuApi.closeContextMenu();
}

/**
 * The add/remove menu items for a gif - used by the tile menu, chat button menu
 * and message context menu.
 *
 * NOTE: this is a plain function returning an array of Menu elements, NOT a
 * component. Discord's Menu API validates the element type of every child and
 * crashes on custom components wrapping items.
 */
export function gifMenuItems(gif: GifInput, instance?: TileInstance) {
    const containing = categoriesContaining(gif.url);
    const others = sortedCategories().filter(c => !containing.includes(c));

    const done = () => instance?.forceUpdate();

    return [
        ...others.map(c => (
            <Menu.MenuItem
                key={"add-" + c.name}
                id={"vc-gifo-add-" + c.name}
                label={`Add to ${c.name}`}
                action={() => { addGifToCategory(c.name, gif).then(done); }}
            />
        )),
        <Menu.MenuItem
            key="new-category"
            id="vc-gifo-new-category"
            label="Add to new category…"
            action={() => openNewCategoryModal(gif, done)}
        />,
        ...(containing.length > 0 ? [<Menu.MenuSeparator key="sep" />] : []),
        ...containing.map(c => (
            <Menu.MenuItem
                key={"remove-" + c.name}
                id={"vc-gifo-remove-" + c.name}
                color="danger"
                label={`Remove from ${c.name}`}
                action={() => { removeGifFromCategory(c.name, gif.url).then(done); }}
            />
        ))
    ];
}

/** Standalone menu for a GIF (picker tile button / chat overlay button) */
export function GifMenu({ gif, instance }: { gif: GifInput; instance?: TileInstance; }) {
    return (
        <Menu.Menu navId="vc-gifo-gif-menu" onClose={closeMenu} aria-label="Organize GIF">
            {gifMenuItems(gif, instance)}
        </Menu.Menu>
    );
}

/** Menu for one of our category cards: rename / delete */
export function CategoryMenu({ name }: { name: string; }) {
    return (
        <Menu.Menu navId="vc-gifo-category-menu" onClose={closeMenu} aria-label="Manage category">
            <Menu.MenuItem
                id="vc-gifo-rename"
                label="Rename category"
                action={() => openRenameCategoryModal(name)}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-gifo-delete"
                color="danger"
                label="Delete category"
                action={() => {
                    openModal(props => (
                        <ConfirmModal
                            {...props}
                            title={`Delete "${name}"?`}
                            subtitle="The GIFs themselves are not deleted, only the category grouping."
                            confirmText="Delete"
                            cancelText="Cancel"
                            onConfirm={() => { deleteCategory(name); }}
                        />
                    ));
                }}
            />
        </Menu.Menu>
    );
}

interface NameModalProps {
    rootProps: RenderModalProps;
    title: string;
    confirmText: string;
    initialValue?: string;
    onSubmit: (name: string) => Promise<string | null>;
}

function NameModal({ rootProps, title, confirmText, initialValue = "", onSubmit }: NameModalProps) {
    const [name, setName] = useState(initialValue);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!name.trim()) return;
        const err = await onSubmit(name);
        if (err) setError(err);
        else rootProps.onClose();
    };

    return (
        <Modal
            {...rootProps}
            size="sm"
            title={title}
            input={
                <TextInput
                    autoFocus
                    placeholder="e.g. Reactions"
                    value={name}
                    onChange={v => { setName(v); setError(null); }}
                    onKeyDown={e => { if (e.key === "Enter") submit(); }}
                    error={error ?? undefined}
                />
            }
            actions={[
                {
                    text: confirmText,
                    variant: "primary",
                    disabled: !name.trim(),
                    onClick: () => { submit(); }
                },
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: rootProps.onClose
                }
            ]}
        />
    );
}

export function openNewCategoryModal(gif?: GifInput, onDone?: () => void) {
    openModal(props => (
        <NameModal
            rootProps={props}
            title="New category"
            confirmText="Create"
            onSubmit={async name => {
                const err = await createCategory(name, gif);
                if (!err) onDone?.();
                return err;
            }}
        />
    ));
}

export function openRenameCategoryModal(oldName: string) {
    openModal(props => (
        <NameModal
            rootProps={props}
            title={`Rename "${oldName}"`}
            confirmText="Rename"
            initialValue={oldName}
            onSubmit={name => renameCategory(oldName, name)}
        />
    ));
}
