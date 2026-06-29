"use client";

import { useState } from "react";
import type { Folder } from "@/lib/types";
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconPlus,
  IconTrash,
  IconPencil,
} from "@/components/icons";

interface TreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (id: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onNewSub: (parentId: string) => void;
}

export function FolderTree(props: TreeProps) {
  const { folders } = props;
  const roots = folders.filter((f) => !f.parentId);
  return (
    <ul className="space-y-0.5">
      {roots.map((f) => (
        <FolderNode key={f.id} folder={f} depth={0} {...props} />
      ))}
    </ul>
  );
}

function FolderNode({
  folder,
  depth,
  folders,
  selectedFolderId,
  onSelect,
  onRename,
  onDelete,
  onNewSub,
}: { folder: Folder; depth: number } & TreeProps) {
  const children = folders.filter((f) => f.parentId === folder.id);
  const [open, setOpen] = useState(true);
  const selected = selectedFolderId === folder.id;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded-lg pr-1 ${
          selected
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-1 text-slate-400 hover:text-slate-600"
            aria-label={open ? "折叠" : "展开"}
          >
            {open ? (
              <IconChevronDown width={14} height={14} />
            ) : (
              <IconChevronRight width={14} height={14} />
            )}
          </button>
        ) : (
          <span className="inline-block w-[22px]" />
        )}
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex flex-1 items-center gap-1.5 py-1.5 text-sm"
        >
          {open && children.length > 0 ? (
            <IconFolderOpen width={15} height={15} className="text-indigo-400" />
          ) : (
            <IconFolder width={15} height={15} className="text-indigo-400" />
          )}
          <span className="truncate">{folder.name}</span>
        </button>
        <div className="flex items-center opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onNewSub(folder.id)}
            className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600"
            title="新建子文件夹"
          >
            <IconPlus width={13} height={13} />
          </button>
          <button
            type="button"
            onClick={() => onRename(folder)}
            className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
            title="重命名"
          >
            <IconPencil width={13} height={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(folder)}
            className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
            title="删除"
          >
            <IconTrash width={13} height={13} />
          </button>
        </div>
      </div>
      {open && children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <FolderNode
              key={c.id}
              folder={c}
              depth={depth + 1}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onNewSub={onNewSub}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
