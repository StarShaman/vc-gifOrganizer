/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { ConfirmModal, ContextMenuApi, Menu, Modal, openModal, TextInput, useState } from "@webpack/common";

import { settings } from "./settings";
import {
    addGifToCategory, BUILTIN_ICONS, categoriesContaining, createCategory, deleteCategory,
    findCategory, GifInput, removeBookmark, removeGifFromCategory, renameCategory,
    setBookmark, sortedCategories
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
    // exclusive mode: once filed, only removal is offered until it's removed
    const locked = settings.store.exclusiveMode && containing.length > 0;
    const others = locked ? [] : sortedCategories().filter(c => !containing.includes(c));

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
        ...(locked ? [] : [
            <Menu.MenuItem
                key="new-category"
                id="vc-gifo-new-category"
                label="Add to new category…"
                action={() => openNewCategoryModal(gif, done)}
            />
        ]),
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

/** Menu for one of our category cards: bookmark / rename / delete */
export function CategoryMenu({ name }: { name: string; }) {
    const bookmarked = !!findCategory(name)?.bookmark;

    return (
        <Menu.Menu navId="vc-gifo-category-menu" onClose={closeMenu} aria-label="Manage category">
            <Menu.MenuItem
                id="vc-gifo-bookmark"
                label={bookmarked ? "Change bookmark icon" : "Bookmark category"}
                action={() => openBookmarkIconModal(name)}
            />
            {bookmarked && (
                <Menu.MenuItem
                    id="vc-gifo-unbookmark"
                    label="Remove bookmark"
                    action={() => { removeBookmark(name); }}
                />
            )}
            <Menu.MenuSeparator />
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

function BookmarkIconModal({ rootProps, name }: { rootProps: RenderModalProps; name: string; }) {
    const pick = (icon: string) => {
        setBookmark(name, icon);
        rootProps.onClose();
    };

    const upload = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") pick(reader.result);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    return (
        <Modal
            {...rootProps}
            size="sm"
            title="Bookmark icon"
            subtitle={`Pick an icon for "${name}"`}
            actions={[
                { text: "Upload image…", variant: "primary", onClick: upload },
                { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
            ]}
        >
            <div className="vc-gifo-icon-grid">
                {Object.entries(BUILTIN_ICONS).map(([key, path]) => (
                    <button
                        key={key}
                        className="vc-gifo-icon-choice"
                        aria-label={key}
                        onClick={() => pick("builtin:" + key)}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path fill="currentColor" d={path} />
                        </svg>
                    </button>
                ))}
            </div>
        </Modal>
    );
}

export function openBookmarkIconModal(name: string) {
    openModal(props => <BookmarkIconModal rootProps={props} name={name} />);
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
