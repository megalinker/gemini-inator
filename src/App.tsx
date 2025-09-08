import React, { useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';
import {
  LucideFolder, LucideX, LucideFile, LucideChevronDown, LucideChevronRight,
  LucideCopy, LucideLoader2, LucideSearch, LucideChevronsRight, LucideChevronsLeft,
  LucideFolderOpen, LucideZap
} from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import xml from 'react-syntax-highlighter/dist/esm/languages/prism/xml-doc';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import qml from 'react-syntax-highlighter/dist/esm/languages/prism/qml';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import protobuf from 'react-syntax-highlighter/dist/esm/languages/prism/protobuf';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

// Register all the languages for my brilliant syntax highlighter
const languagesToRegister = { jsx, javascript, typescript, python, rust, css, scss, json, markdown, toml, xml, c, cpp, qml, java, kotlin, protobuf };
Object.entries(languagesToRegister).forEach(([name, lang]) => {
  SyntaxHighlighter.registerLanguage(name, lang);
});


// --- TYPE DEFINITIONS ---

/**
 * Represents a single entry (a file or directory) in the file system tree.
 */
interface FileSystemEntry {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  path: string;
  handle: FileSystemHandle;
  selected: boolean;
  children?: FileSystemEntry[];
  isOpen?: boolean;
  indeterminate?: boolean;
  isLoadingChildren?: boolean;
}

type TabId = 'output' | string; // A tab can be the output or a file ID
type PreviewType = 'code' | 'image' | 'video' | 'unsupported';

interface PreviewState {
  content: string;
  isLoading: boolean;
  error: string | null;
  type: PreviewType;
}

interface WorkAreaPanelProps {
  openTabs: FileSystemEntry[];
  activeTabId: TabId;
  onTabClick: (id: TabId) => void;
  onCloseTab: (id: TabId) => void;
  children: ReactNode;
}

// --- CONFIGURATION CONSTANTS ---

/**
 * My Brilliant Ignore-Inator Blueprints: A map of filter names to functions.
 * Each function returns true if a given path should be excluded.
 */
const COMMON_EXCLUSIONS: Record<string, (path: string) => boolean> = {
  'Node Modules': (path: string) => path === 'node_modules' || path.startsWith('node_modules/'),
  'Dist/Build': (path: string) => ['dist', 'build'].some(dir => path === dir || path.startsWith(`${dir}/`)),
  'Git Files': (path: string) => (path === '.git' || path.startsWith('.git/')) || path.endsWith('.gitignore'),
  'VSCode Config': (path: string) => path === '.vscode' || path.startsWith('.vscode/'),
  'Android Studio': (path: string) => {
    const androidExclusions = ['.idea', 'gradle/', 'gradlew', 'gradlew.bat', 'local.properties'];
    return androidExclusions.some(p => path === p || path.startsWith(`${p}/`));
  },
  'DFINITY/ICP': (path: string) => (path === '.dfx' || path.startsWith('.dfx/')) || (path === '.mops' || path.startsWith('.mops/')) || path.endsWith('dfx.json') || path.endsWith('canister_ids.json') || path.endsWith('mops.toml'),
  'JS/TS Config': (path: string) => (path === 'public' || path.startsWith('public/')) || path.endsWith('package.json') || path.endsWith('tsconfig.json') || path.endsWith('vite.config.ts') || path.includes('.env'),
  'Lock Files': (path: string) => path.endsWith('package-lock.json') || path.endsWith('yarn.lock'),
  'Markdown': (path: string) => path.toLowerCase().endsWith('.md'),
  'Compressed Files': (path: string) => ['.rar', '.zip'].some(ext => path.toLowerCase().endsWith(ext)),
  'Image Files': (path: string) => ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].some(ext => path.toLowerCase().endsWith(ext)),
};


// --- HELPER FUNCTIONS ---

const hasOverrideUnder = (dirPath: string, overrides: Set<string>) => {
  const prefix = dirPath ? dirPath + '/' : '';
  for (const id of overrides) {
    if (id === dirPath || id.startsWith(prefix)) return true;
  }
  return false;
};

/**
 * Recursively finds a file system entry by its ID within a tree structure.
 */
const findEntry = (nodes: FileSystemEntry[], id: string): FileSystemEntry | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findEntry(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Reads all entries from a given directory handle and sorts them.
 */
const processDirectoryLevel = async (directoryHandle: FileSystemDirectoryHandle, path = ''): Promise<FileSystemEntry[]> => {
  const entries: FileSystemEntry[] = [];
  for await (const handle of directoryHandle.values()) {
    const newPath = path ? `${path}/${handle.name}` : handle.name;
    entries.push({
      id: newPath,
      name: handle.name,
      kind: handle.kind,
      path: newPath,
      handle: handle,
      selected: true,
      isOpen: false,
    });
  }
  // Sort with directories first, then alphabetically.
  return entries.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
};

/**
 * Lazily loads children for a specific directory and inserts them into the tree.
 * This corrected version ensures that child selection state is set correctly
 * based on the parent's state, preventing selection corruption upon expansion.
 */
const loadAndInsertChildren = async (
  baseTree: FileSystemEntry[],
  id: string,
  activeFilters: Set<string>,
  includeOverrides: Set<string>
): Promise<FileSystemEntry[]> => {
  const entryToLoad = findEntry(baseTree, id);
  if (!entryToLoad || entryToLoad.kind !== 'directory') return baseTree;

  const rawChildren = await processDirectoryLevel(entryToLoad.handle as FileSystemDirectoryHandle, entryToLoad.path);
  const filterFns = Array.from(activeFilters).map(name => COMMON_EXCLUSIONS[name]);

  const processedChildren = rawChildren.map(child => {
    const isFiltered = filterFns.some(fn => fn(child.path));
    const parentFullySelected = entryToLoad.selected && !entryToLoad.indeterminate;
    const overridden = includeOverrides.has(child.id);
    return {
      ...child,
      selected: overridden ? true : (parentFullySelected && !isFiltered),
    };
  });

  const buildNewTree = (nodes: FileSystemEntry[]): FileSystemEntry[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return { ...node, children: processedChildren, isLoadingChildren: false };
      }
      if (node.children) {
        return { ...node, children: buildNewTree(node.children) };
      }
      return node;
    });
  };
  return buildNewTree(baseTree);
};


/**
 * Recursively applies active filters to the tree, updating selection states.
 * It cleverly preserves the `isOpen` state of directories.
 */
const applyFiltersAndPreserveOpenState = (
  nodes: FileSystemEntry[],
  activeFilters: Set<string>,
  includeOverrides: Set<string>
): FileSystemEntry[] => {
  const filterFns = Array.from(activeFilters).map(name => COMMON_EXCLUSIONS[name]);
  const hasActiveFilters = activeFilters.size > 0;

  const isPathFiltered = (p: string) => filterFns.some(fn => fn(p));

  const recurse = (entries: FileSystemEntry[]): FileSystemEntry[] => {
    return entries.map(entry => {
      const wasSelected = !!entry.selected;
      const wasIndeterminate = !!entry.indeterminate;
      const isFilteredHere = isPathFiltered(entry.path);

      // --- DIRECTORIES ---
      if (entry.kind === 'directory') {
        // If the directory itself is filtered (e.g., node_modules) and there's no override under it, unselect it.
        if (isFilteredHere && !hasOverrideUnder(entry.path, includeOverrides)) {
          return { ...entry, selected: false, indeterminate: false };
        }

        if (entry.children) {
          const newChildren = recurse(entry.children);

          const selectedOrIndeterminate = newChildren.filter(c => c.selected || c.indeterminate).length;
          const allFullySelected =
            newChildren.length > 0 && newChildren.every(c => c.selected && !c.indeterminate);

          // Preserve the user's folder selection; compute only the visual indeterminate.
          let newSelected = wasSelected;
          let newIndeterminate = false;

          if (newChildren.length === 0) {
            // No visible children after filters. If the user had selected this folder,
            // show "indeterminate" to indicate hidden (filtered) content.
            newIndeterminate = hasActiveFilters && wasSelected;
          } else if (allFullySelected) {
            // All visible children fully selected
            newIndeterminate = false;
          } else if (selectedOrIndeterminate > 0) {
            // Some visible children selected/indeterminate
            newIndeterminate = true;
          } else {
            // No visible children selected. If user had it selected and filters are active,
            // keep it selected but indeterminate to avoid "auto-unchecking" the folder.
            newIndeterminate = hasActiveFilters && wasSelected;
          }

          return { ...entry, children: newChildren, selected: newSelected, indeterminate: newIndeterminate };
        }

        // Unloaded directory (no children loaded yet).
        // Do NOT auto-uncheck just because filters are active.
        // Keep user's selection, and if filters are active and it’s selected, show indeterminate.
        return {
          ...entry,
          selected: wasSelected,
          indeterminate: hasActiveFilters && wasSelected,
        };
      }

      // --- FILES ---
      // Manual override always wins.
      if (includeOverrides.has(entry.id)) {
        return { ...entry, selected: true, indeterminate: false };
      }

      // For filtered files, don't include them in selection,
      // but don't mutate parent selection logic beyond this point.
      if (isFilteredHere) {
        return { ...entry, selected: false, indeterminate: false };
      }

      // Otherwise, file is selectable as usual.
      return { ...entry, selected: true, indeterminate: false };
    });
  };

  return recurse(nodes);
};


/**
 * Updates the selection state of an entry and all its children, then corrects parent states up the tree.
 */
const updateSelectionRecursive = (nodes: FileSystemEntry[], id: string, selected: boolean): FileSystemEntry[] => {
  // First, propagate the user's click downwards.
  // If a parent is checked, all children are checked. If unchecked, all are unchecked.
  const updateChildren = (entries: FileSystemEntry[]): FileSystemEntry[] => {
    return entries.map(entry => {
      if (entry.id === id) {
        const updatedEntry = { ...entry, selected, indeterminate: false };
        if (updatedEntry.kind === 'directory' && updatedEntry.children) {
          const updateAllChildren = (children: FileSystemEntry[]): FileSystemEntry[] =>
            children.map(child => ({
              ...child,
              selected,
              indeterminate: false,
              children: child.children ? updateAllChildren(child.children) : undefined
            }));
          updatedEntry.children = updateAllChildren(updatedEntry.children);
        }
        return updatedEntry;
      }
      if (entry.children) {
        return { ...entry, children: updateChildren(entry.children) };
      }
      return entry;
    });
  };

  const treeWithUpdatedChildren = updateChildren(nodes);

  // Second, bubble up from the bottom to correct the state of all parent directories.
  const correctParentStates = (entries: FileSystemEntry[]): FileSystemEntry[] => {
    return entries.map(entry => {
      // We only care about directories with loaded children.
      if (entry.kind !== 'directory' || !entry.children) {
        return entry;
      }

      // First, ensure all children have their correct states.
      const newChildren = correctParentStates(entry.children);

      // We now correctly check for both selected and indeterminate children.
      const fullySelectedChildren = newChildren.filter(c => c.selected && !c.indeterminate).length;
      const partiallySelectedChildren = newChildren.filter(c => c.indeterminate).length;
      const totalSelectedDescendants = fullySelectedChildren + partiallySelectedChildren;

      let newSelected = false;
      let newIndeterminate = false;

      if (totalSelectedDescendants === 0) {
        // CASE 1: No children are selected or indeterminate. This parent is fully deselected.
        newSelected = false;
        newIndeterminate = false;
      } else if (fullySelectedChildren === newChildren.length) {
        // CASE 2: All children are fully selected. This parent is also fully selected.
        newSelected = true;
        newIndeterminate = false;
      } else {
        // CASE 3: Any other combination (some selected, some not; some indeterminate).
        // This parent must be in an indeterminate state.
        newSelected = false;
        newIndeterminate = true;
      }

      return { ...entry, children: newChildren, selected: newSelected, indeterminate: newIndeterminate };
    });
  };

  // Run the correction process on the whole tree.
  return correctParentStates(treeWithUpdatedChildren);
};

/**
 * Recursively expands or collapses all folders in the tree.
 */
const toggleAllFolders = (entries: FileSystemEntry[], isOpen: boolean): FileSystemEntry[] => {
  return entries.map(entry => {
    if (entry.kind === 'directory') {
      return {
        ...entry,
        isOpen,
        children: entry.children ? toggleAllFolders(entry.children, isOpen) : undefined
      };
    }
    return entry;
  });
};

/**
 * Determines the type of preview to show based on the file extension.
 */
const getPreviewType = (filename: string): 'code' | 'image' | 'video' | 'unsupported' => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  const codeExtensions = [
    'js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'scss', 'md', 'py', 'rs', 'xml',
    'c', 'cpp', 'h', 'qml', 'qrc', 'mo', 'toml', 'txt', 'java', 'kt', 'kts', 'proto', 'gradle', 'move'
  ];

  if (codeExtensions.includes(extension)) return 'code';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(extension)) return 'video';

  return 'unsupported';
};

/**
 * Gets the correct language string for the syntax highlighter based on file extension.
 */
const getLanguageForPreview = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'cpp': return 'cpp';
    case 'h': return 'c';
    case 'qml': return 'qml';
    case 'mo': return 'motoko';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'html': return 'html';
    case 'json': return 'json';
    case 'xml': case 'qrc': return 'xml';
    case 'jsx': case 'tsx': return 'jsx';
    case 'java': return 'java';
    case 'kt': case 'kts': return 'kotlin';
    case 'proto': return 'protobuf';
    case 'move': return 'rust'; // Using Rust for approximate highlighting
    case 'txt':
    default: return 'plaintext';
  }
};


// --- REACT COMPONENTS ---

/**
 * A custom checkbox component that supports an "indeterminate" state.
 */
const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id: string;
}> = ({ checked, indeterminate, onChange, id }) => {
  const ref = useRef<HTMLInputElement>(null!);

  useEffect(() => {
    ref.current.indeterminate = indeterminate || false;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      className="form-checkbox h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-600 focus:ring-offset-gray-800"
    />
  );
};

/**
 * Renders the file tree recursively and handles user interactions.
 */
const FileTree: React.FC<{
  entries: FileSystemEntry[];
  filterText: string;
  onToggleSelection: (id: string, selected: boolean) => void;
  onToggleOpen: (id: string) => void;
  onPreviewFile: (entry: FileSystemEntry) => void;
}> = ({ entries, filterText, onToggleSelection, onToggleOpen, onPreviewFile }) => {
  const filteredEntries = useMemo(() => {
    if (!filterText) return entries;
    const lowercasedFilter = filterText.toLowerCase();

    const filter = (items: FileSystemEntry[]): FileSystemEntry[] => {
      return items.reduce((acc, item) => {
        if (item.name.toLowerCase().includes(lowercasedFilter)) {
          acc.push(item);
          return acc;
        }
        if (item.children) {
          const filteredChildren = filter(item.children);
          if (filteredChildren.length > 0) {
            acc.push({ ...item, children: filteredChildren });
          }
        }
        return acc;
      }, [] as FileSystemEntry[]);
    };
    return filter(entries);
  }, [entries, filterText]);

  if (filteredEntries.length === 0 && filterText.length > 0) {
    return <div className="p-4 text-center text-gray-500">Not a single gizmo matches your search.</div>;
  }

  return (
    <ul className="pl-2 text-gray-300">
      {filteredEntries.map(entry => (
        <li key={entry.id} className="my-0.5">
          <div className="flex items-center p-1 rounded-md hover:bg-gray-700/50">
            <IndeterminateCheckbox
              id={`cb-${entry.id}`}
              checked={entry.selected}
              indeterminate={entry.indeterminate}
              onChange={(e) => onToggleSelection(entry.id, e.target.checked)}
            />
            <label htmlFor={`cb-${entry.id}`} className="flex items-center w-full ml-3 cursor-pointer">
              {entry.kind === 'directory' ? (
                <button onClick={() => onToggleOpen(entry.id)} className="flex items-center">
                  {entry.isLoadingChildren ? (
                    <LucideLoader2 size={18} className="mr-1 text-gray-400 animate-spin" />
                  ) : (
                    entry.isOpen ? (
                      <LucideChevronDown size={18} className="mr-1 text-gray-400" />
                    ) : (
                      <LucideChevronRight size={18} className="mr-1 text-gray-400" />
                    )
                  )}
                  <LucideFolder size={18} className="mr-2 text-yellow-500" />
                </button>
              ) : (
                <div className="flex items-center ml-5">
                  <LucideFile size={18} className="mr-2 text-blue-400" />
                </div>
              )}
              <button
                onClick={() => onPreviewFile(entry)}
                className="text-left truncate hover:text-indigo-400 hover:underline"
                title={`Inspect ${entry.name}`}
              >
                {entry.name}
              </button>
            </label>
          </div>
          {entry.kind === 'directory' && entry.isOpen && entry.children && (
            <FileTree
              entries={entry.children}
              filterText=""
              onToggleSelection={onToggleSelection}
              onToggleOpen={onToggleOpen}
              onPreviewFile={onPreviewFile}
            />
          )}
        </li>
      ))}
    </ul>
  );
};

/**
 * Displays the main controls, including folder selection and filter toggles.
 */
const ControlPanel: React.FC<{
  onSelectFolder: () => void;
  isLoading: boolean;
  activeFilters: Set<string>;
  onToggleFilter: (name: string) => void;
  onSelectAllFilters: () => void;
}> = ({ onSelectFolder, isLoading, activeFilters, onToggleFilter, onSelectAllFilters }) => (
  <div className="flex flex-col gap-6 p-4 border border-gray-700 rounded-lg shadow-lg bg-gray-800/50">
    <button
      onClick={onSelectFolder}
      disabled={isLoading}
      className="flex items-center justify-center w-full px-4 py-3 font-bold text-white transition-colors duration-200 bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed text-lg"
    >
      {isLoading ? (
        <><LucideLoader2 className="mr-2 animate-spin" /> Absorbing...</>
      ) : (
        <><LucideFolderOpen className="mr-2" /> Select a Folder-Inator!</>
      )}
    </button>
    <div>
      <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-300 border-b border-gray-600">Master Control-Inators</h3>
      <button
        onClick={onSelectAllFilters}
        className="flex items-center justify-center w-full px-4 py-2 mb-4 font-bold text-white transition-colors duration-200 bg-purple-600 rounded-lg hover:bg-purple-700"
      >
        <LucideZap size={18} className="mr-2" /> Activate ALL Ignore-Inators!
      </button>

      <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-300 border-b border-gray-600">Individual Ignore-Inators</h3>
      <div className="flex flex-wrap gap-2">
        {Object.keys(COMMON_EXCLUSIONS).map((name) => (
          <button
            key={name}
            onClick={() => onToggleFilter(name)}
            className={`py-1.5 px-3 rounded-full text-sm transition-colors duration-200 ${activeFilters.has(name)
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  </div>
);

/**
 * Displays the file tree explorer view with search and expand/collapse controls.
 */
const FileExplorer: React.FC<{
  directoryName: string | null;
  fileTree: FileSystemEntry[];
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onToggleSelection: (id: string, selected: boolean) => void;
  onToggleOpen: (id: string) => void;
  onToggleAll: (isOpen: boolean) => void;
  onPreviewFile: (entry: FileSystemEntry) => void;
}> = ({ directoryName, fileTree, filterText, onFilterTextChange, onToggleSelection, onToggleOpen, onToggleAll, onPreviewFile }) => (
  <div className="flex flex-col p-4 border border-gray-700 rounded-lg shadow-lg bg-gray-800/50">
    <h2 className="pb-3 mb-4 text-xl font-semibold text-gray-200 border-b border-gray-600 truncate">
      Target Acquired: <span className="text-indigo-400">{directoryName}-Inator!</span>
    </h2>
    <div className="flex gap-2 mb-3">
      <div className="relative flex-grow">
        <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          type="text"
          placeholder="Find a specific gizmo..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          className="w-full py-2 pl-10 pr-4 text-gray-300 border border-gray-600 rounded-md bg-gray-900/70 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <button onClick={() => onToggleAll(true)} title="Expand All Gizmos" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600">
        <LucideChevronsRight size={20} />
      </button>
      <button onClick={() => onToggleAll(false)} title="Collapse All Gizmos" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600">
        <LucideChevronsLeft size={20} />
      </button>
    </div>
    <div className="flex-grow p-2 overflow-y-auto border border-gray-700 rounded-md bg-gray-900/60 min-h-[60vh]">
      <FileTree
        entries={fileTree}
        filterText={filterText}
        onToggleSelection={onToggleSelection}
        onToggleOpen={onToggleOpen}
        onPreviewFile={onPreviewFile}
      />
    </div>
  </div>
);

/**
 * Panel for previewing the content of a selected file.
 */
const PreviewPanel: React.FC<{
  file: FileSystemEntry;
  content: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}> = ({ file, content, isLoading, error, onClose }) => {
  const previewType = getPreviewType(file.name);

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center h-full"><LucideLoader2 className="w-12 h-12 text-indigo-400 animate-spin" /></div>;
    }
    if (error) {
      return <div className="p-4 text-red-400">{error}</div>;
    }
    if (!content) {
      return <div className="p-4 text-gray-500">Select a file to inspect its contents.</div>;
    }

    const FixedSyntaxHighlighter = SyntaxHighlighter as any;

    switch (previewType) {
      case 'code':
        return (
          <FixedSyntaxHighlighter language={getLanguageForPreview(file.name)} style={vscDarkPlus} customStyle={{ background: 'transparent', margin: 0, height: '100%' }}>
            {content}
          </FixedSyntaxHighlighter>
        );
      case 'image':
        return (
          <div className="flex items-center justify-center h-full p-4">
            <img src={content} alt={`Preview of ${file.name}`} className="object-contain max-w-full max-h-full" />
          </div>
        );
      case 'video':
        return (
          <div className="flex items-center justify-center h-full p-4">
            <video src={content} controls className="max-w-full max-h-full" />
          </div>
        );
      default:
        return <div className="p-4 text-gray-400">Preview for this file type is not supported by my -Inator. It's probably boring anyway.</div>;
    }
  };

  return (
    <div className="flex flex-col p-4 border border-gray-700 rounded-lg shadow-lg bg-gray-800/50">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-600">
        <div className="flex items-center truncate">
          <LucideFile size={18} className="mr-2 text-blue-400 shrink-0" />
          <h2 className="text-xl font-semibold text-gray-200 truncate" title={file.path}>
            Inspecting: {file.name}
          </h2>
        </div>
        <button onClick={onClose} title="Close Inspector" className="p-2 bg-gray-700 rounded-full hover:bg-gray-600">
          <LucideX size={20} />
        </button>
      </div>
      <div className="flex-grow overflow-auto border border-gray-700 rounded-md bg-gray-900/60 min-h-[60vh]">
        {renderContent()}
      </div>
    </div>
  );
};

/**
 * Displays the final generated text output and provides generation/copy controls.
 */
const OutputPanel: React.FC<{
  generatedText: string;
  isGenerating: boolean;
  hasFiles: boolean;
  onGenerate: () => void;
  onCopy: () => void;
  copySuccess: boolean;
  promptPrefix: string;
  onPromptPrefixChange: (value: string) => void;
  promptSuffix: string;
  onPromptSuffixChange: (value: string) => void;
}> = ({ generatedText, isGenerating, hasFiles, onGenerate, onCopy, copySuccess, promptPrefix, onPromptPrefixChange, promptSuffix, onPromptSuffixChange }) => {

  const { charCount, tokenCount } = useMemo(() => {
    const parts = [];
    if (promptPrefix) parts.push(promptPrefix);
    if (generatedText) parts.push(generatedText);
    if (promptSuffix) parts.push(promptSuffix);
    const combinedText = parts.join('\n\n');

    const chars = combinedText.length;
    const tokens = Math.ceil(chars / 4);
    return { charCount: chars, tokenCount: tokens };
  }, [generatedText, promptPrefix, promptSuffix]);

  const SYNTAX_HIGHLIGHT_LIMIT = 200000;
  const isTooLargeForHighlighting = generatedText.length > SYNTAX_HIGHLIGHT_LIMIT;
  const FixedSyntaxHighlighter = SyntaxHighlighter as any;

  return (
    <div className="flex flex-col p-4 border border-gray-700 rounded-lg shadow-lg bg-gray-800/50">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-600">
        <h2 className="text-xl font-semibold text-gray-200">My Glorious Output!</h2>
        <button
          onClick={onGenerate}
          disabled={isGenerating || !hasFiles}
          className="flex items-center justify-center w-48 px-4 py-2 font-bold text-white transition-colors duration-200 bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-900/50 disabled:cursor-not-allowed"
        >
          {isGenerating ? <><LucideLoader2 className="mr-2 animate-spin" />It's Working!...</> : "FIRE THE -INATOR!"}
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="prompt-prefix" className="block mb-1 text-sm font-medium text-gray-400">
          Prepend to Prompt (Opening Context):
        </label>
        <textarea
          id="prompt-prefix"
          rows={3}
          value={promptPrefix}
          onChange={(e) => onPromptPrefixChange(e.target.value)}
          placeholder="For example: This is my app..."
          className="w-full p-2 text-gray-300 border border-gray-600 rounded-md resize-y bg-gray-900/70 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="relative flex-grow">
        {generatedText && (
          <button onClick={onCopy} className="absolute top-2 right-2 z-10 flex items-center px-3 py-1 text-sm text-gray-300 transition-colors bg-gray-700 rounded-md hover:bg-gray-600">
            <LucideCopy size={14} className="mr-2" />
            {copySuccess ? 'My Genius! Stolen!' : 'Steal My Genius!'}
          </button>
        )}
        {isTooLargeForHighlighting && (
          <div className="px-3 py-1.5 text-xs text-yellow-400 border border-yellow-700 rounded-t-md bg-yellow-900/30">
            My output is too powerful for fancy colors! Displaying as plain text for performance.
          </div>
        )}
        <div className={`w-full h-[calc(60vh)] font-mono text-sm text-gray-300 bg-gray-900/70 border border-gray-700 overflow-auto focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${isTooLargeForHighlighting ? 'rounded-b-md' : 'rounded-md'}`}>
          {isTooLargeForHighlighting ? (
            <textarea readOnly value={generatedText} className="w-full h-full p-4 bg-transparent border-none resize-none focus:ring-0" />
          ) : (
            <FixedSyntaxHighlighter language="javascript" style={vscDarkPlus} customStyle={{ background: 'transparent', margin: 0, padding: '1rem', height: '100%' }}>
              {generatedText || "// The combined text-thingy will appear here... probably."}
            </FixedSyntaxHighlighter>
          )}
        </div>

        <div className="mt-4">
          <label htmlFor="prompt-suffix" className="block mb-1 text-sm font-medium text-gray-400">
            Append to Prompt (Final Instructions):
          </label>
          <textarea
            id="prompt-suffix"
            rows={3}
            value={promptSuffix}
            onChange={(e) => onPromptSuffixChange(e.target.value)}
            placeholder="For example: Please analyze this code for bugs..."
            className="w-full p-2 text-gray-300 border border-gray-600 rounded-md resize-y bg-gray-900/70 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {(generatedText || promptSuffix) && (
          <div className="pr-1 mt-2 text-xs text-right text-gray-500">
            {charCount.toLocaleString()} characters | ~{tokenCount.toLocaleString()} tokens of pure evil genius!
          </div>
        )}
      </div>
    </div>
  );
};


/**
 * Main App Component - My Evil Lair
 * This component orchestrates the entire application, managing state and logic for file handling,
 * UI interactions, and text generation.
 */
const FILTERS_STORAGE_KEY = 'doofenshmirtz_evil_incorporated_filters';

const WorkAreaPanel: React.FC<WorkAreaPanelProps> = ({ openTabs, activeTabId, onTabClick, onCloseTab, children }) => {
  const [preview, setPreview] = useState<PreviewState>({ content: '', isLoading: false, error: null, type: 'unsupported' });
  const activeFile = useMemo(() => openTabs.find(tab => tab.id === activeTabId), [openTabs, activeTabId]);

  useEffect(() => {
    if (activeTabId === 'output' || !activeFile) {
      return;
    }

    const loadContent = async (fileEntry: FileSystemEntry) => {
      setPreview({ content: '', isLoading: true, error: null, type: 'unsupported' });

      const previewType = getPreviewType(fileEntry.name);
      if (previewType === 'unsupported') {
        setPreview({ content: '', isLoading: false, error: "This file type cannot be previewed.", type: 'unsupported' });
        return;
      }

      try {
        const fileHandle = fileEntry.handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();

        if (previewType === 'code') {
          if (file.size > 5 * 1024 * 1024) throw new Error("Code file is too large for preview!");
          const text = await file.text();
          setPreview({ content: text, isLoading: false, error: null, type: 'code' });
        } else if (previewType === 'image' || previewType === 'video') {
          if (file.size > 50 * 1024 * 1024) throw new Error("Media file is too large for preview!");
          const url = URL.createObjectURL(file);
          setPreview({ content: url, isLoading: false, error: null, type: previewType });
        }
      } catch (err: any) {
        setPreview({ content: '', isLoading: false, error: err.message, type: 'unsupported' });
      }
    };

    loadContent(activeFile);

    return () => {
      if (preview.content && preview.content.startsWith('blob:')) {
        URL.revokeObjectURL(preview.content);
      }
    };
  }, [activeTabId, activeFile]);

  const renderContent = () => {
    if (activeTabId === 'output') return children;
    if (!activeFile) return null;

    return (
      <PreviewPanel
        key={activeFile.id}
        file={activeFile}
        content={preview.content}
        isLoading={preview.isLoading}
        error={preview.error}
        onClose={() => onCloseTab(activeFile.id)}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-end border-b-2 border-gray-700 bg-gray-900/70">
        <button
          onClick={() => onTabClick('output')}
          className={`flex items-center px-4 py-2 border-b-2 text-sm transition-colors duration-200 ${activeTabId === 'output' ? 'bg-gray-800/60 border-indigo-400 text-white' : 'border-transparent text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
            }`}
        >
          <LucideZap size={14} className="mr-2 text-green-400" />
          Output
        </button>
        {openTabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center group pl-4 pr-2 py-2 border-b-2 text-sm transition-colors duration-200 ${activeTabId === tab.id ? 'bg-gray-800/60 border-indigo-400 text-white' : 'border-transparent text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
              }`}
          >
            <button onClick={() => onTabClick(tab.id)} className="flex items-center">
              <LucideFile size={14} className="mr-2 text-blue-400" />
              {tab.name}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="ml-3 p-0.5 rounded-full opacity-50 group-hover:opacity-100 hover:bg-red-500/50"
              title={`Close ${tab.name}`}
            >
              <LucideX size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex-grow bg-gray-800/50 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
};

/**
 * Checks if a path is excluded by any of the active filters and returns the name of the filter.
 * @param path The file or directory path to check.
 * @param activeFilters The set of currently active filter names.
 * @returns The name of the matching filter, or null if not excluded.
 */
const getExclusionReason = (path: string, activeFilters: Set<string>): string | null => {
  for (const filterName of activeFilters) {
    const filterFn = COMMON_EXCLUSIONS[filterName];
    if (filterFn && filterFn(path)) {
      return filterName; // Return the name of the first matching filter
    }
  }
  return null; // Not excluded by any active filter
};

export default function App() {

  // --- STATE MANAGEMENT ---

  const [initialFileTree, setInitialFileTree] = useState<FileSystemEntry[]>([]);
  const [processedFileTree, setProcessedFileTree] = useState<FileSystemEntry[]>([]);
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  const [promptPrefix, setPromptPrefix] = useState<string>('');
  const [promptSuffix, setPromptSuffix] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<FileSystemEntry[]>([]);
  const [activeTabId, setActiveTabId] = useState<TabId>('output');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [includeOverrides, setIncludeOverrides] = useState<Set<string>>(new Set());

  // Load active filters from localStorage on initial render.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => {
    try {
      const savedFilters = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {
      console.error("Could not load my evil filters from localStorage", e);
    }
    return new Set(); // Default to an empty set.
  });

  const processDirectoryAndSetState = useCallback(async (directoryHandle: FileSystemDirectoryHandle) => {
    try {
      setError(null);
      setOpenTabs([]);
      setActiveTabId('output');
      setGeneratedText('');
      setInitialFileTree([]);
      setProcessedFileTree([]);
      setIsLoading(true);
      setIncludeOverrides(new Set());
      setDirectoryName(directoryHandle.name);
      const tree = await processDirectoryLevel(directoryHandle);
      setInitialFileTree(tree); // This triggers the useEffect to process and filter the tree
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(`My scheme has failed! ${err.message}`);
      }
    } finally {
      setIsLoading(false);
      setIsDraggingOver(false);
    }
  }, []);

  // --- SIDE EFFECTS ---

  // Save active filters to localStorage whenever they change.
  useEffect(() => {
    try {
      const filtersJSON = JSON.stringify(Array.from(activeFilters));
      window.localStorage.setItem(FILTERS_STORAGE_KEY, filtersJSON);
    } catch (e) {
      console.error("Could not save my evil filters to localStorage", e);
    }
  }, [activeFilters]);

  // Re-apply filters to the tree whenever the active filters change.
  useEffect(() => {
    if (initialFileTree.length > 0) {
      const newlyProcessedTree = applyFiltersAndPreserveOpenState(initialFileTree, activeFilters, includeOverrides);
      setProcessedFileTree(newlyProcessedTree);
    }
    // Don't add includeOverrides to deps to avoid wiping manual non-override selections
  }, [activeFilters, initialFileTree]);


  // --- EVENT HANDLERS ---

  const handleSelectFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      setError('My plans are foiled! Your browser does not support the File System Access API.');
      return;
    }
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await processDirectoryAndSetState(directoryHandle); // Use the refactored logic
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(`My scheme has failed! ${err.message}`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const handle = await items[0].getAsFileSystemHandle();
      if (handle && handle.kind === 'directory') {
        await processDirectoryAndSetState(handle as FileSystemDirectoryHandle);
      } else {
        setError("That's not a folder! My -Inator only works on entire folders of evil schemes.");
      }
    }
  };

  const handleToggleSelection = useCallback((id: string, selected: boolean) => {
    setProcessedFileTree(currentTree => updateSelectionRecursive(currentTree, id, selected));

    // Record overrides only when the user clicks a FILE checkbox.
    const entry = findEntry(processedFileTree, id);
    if (entry && entry.kind === 'file') {
      setIncludeOverrides(prev => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }, [processedFileTree]);


  const handleToggleAll = useCallback((isOpen: boolean) => {
    setProcessedFileTree(currentTree => toggleAllFolders(currentTree, isOpen));
  }, []);

  const handleToggleFilter = (filterName: string) => {
    setActiveFilters(currentFilters => {
      const newFilters = new Set(currentFilters);
      newFilters.has(filterName) ? newFilters.delete(filterName) : newFilters.add(filterName);
      return newFilters;
    });
  };

  const handleSelectAllFilters = () => {
    setActiveFilters(new Set(Object.keys(COMMON_EXCLUSIONS)));
  };

  const handleToggleOpen = useCallback((id: string) => {
    const entryToToggle = findEntry(processedFileTree, id);
    if (!entryToToggle) return;

    const needsToLoad = entryToToggle.kind === 'directory' && entryToToggle.children === undefined;

    // This part, which shows the spinner, is fine.
    const buildNewTree = (nodes: FileSystemEntry[]): FileSystemEntry[] => {
      return nodes.map(entry => {
        if (entry.id === id) {
          return { ...entry, isOpen: needsToLoad ? true : !entry.isOpen, isLoadingChildren: needsToLoad };
        }
        if (entry.children) {
          return { ...entry, children: buildNewTree(entry.children) };
        }
        return entry;
      });
    };
    const treeWithSpinner = buildNewTree(processedFileTree);
    setProcessedFileTree(treeWithSpinner);

    if (needsToLoad) {
      loadAndInsertChildren(treeWithSpinner, id, activeFilters, includeOverrides)
        .then(finalTree => setProcessedFileTree(finalTree))
        .catch(err => console.error("Failed to load directory children:", err));
    }
  }, [processedFileTree, activeFilters]);

  const handlePreviewFile = useCallback((entry: FileSystemEntry) => {
    if (entry.kind !== 'file') return;

    setOpenTabs(currentTabs => {
      if (currentTabs.find(tab => tab.id === entry.id)) {
        return currentTabs; // Already open, do nothing
      }
      return [...currentTabs, entry];
    });
    setActiveTabId(entry.id);
  }, []);

  const handleCloseTab = useCallback((tabIdToClose: TabId) => {
    const tabIndex = openTabs.findIndex(tab => tab.id === tabIdToClose);
    if (tabIndex === -1) return;

    if (activeTabId === tabIdToClose) {
      const newActiveTabId = openTabs[tabIndex - 1]?.id || 'output';
      setActiveTabId(newActiveTabId);
    }

    setOpenTabs(currentTabs => currentTabs.filter(tab => tab.id !== tabIdToClose));
  }, [openTabs, activeTabId]);

  /**
 * Recursively builds a complete in-memory representation of the file tree,
 * loading any un-expanded directories that are selected or indeterminate.
 * This is the new, robust "pre-computation" step.
 */
  const buildCompleteTree = async (
    nodes: FileSystemEntry[],
    activeFilters: Set<string>,
    includeOverrides: Set<string>
  ): Promise<FileSystemEntry[]> => {
    const newNodes: FileSystemEntry[] = [];
    const filterFns = Array.from(activeFilters).map(name => COMMON_EXCLUSIONS[name]);

    for (const node of nodes) {
      const isFiltered = filterFns.some(fn => fn(node.path));

      if (node.kind === 'file') {
        // Skip only if filtered AND not manually overridden
        if (isFiltered && !includeOverrides.has(node.id)) continue;
        newNodes.push(node);
        continue;
      }

      // Directories
      const dirHasOverride = hasOverrideUnder(node.path, includeOverrides);
      const skipDir = isFiltered && !dirHasOverride;

      if (skipDir) {
        // fully filtered and no overridden descendants
        continue;
      }

      const mustTraverse =
        dirHasOverride || node.selected || node.indeterminate;

      if (mustTraverse && node.children === undefined) {
        try {
          const rawChildren = await processDirectoryLevel(node.handle as FileSystemDirectoryHandle, node.path);
          const expandedChildren = await buildCompleteTree(rawChildren, activeFilters, includeOverrides);
          newNodes.push({ ...node, children: expandedChildren });
        } catch {
          newNodes.push({ ...node, children: [] });
        }
      } else if (node.children) {
        const expandedChildren = await buildCompleteTree(node.children, activeFilters, includeOverrides);
        newNodes.push({ ...node, children: expandedChildren });
      } else {
        newNodes.push(node);
      }
    }
    return newNodes;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedText('Phase 1: Analyzing all evil plans (this may take a moment for large folders)...');
    setCopySuccess(false);

    try {
      const completeTree = await buildCompleteTree(processedFileTree, activeFilters, includeOverrides);

      // --- Recursive logging function ---
      const logInclusionStatus = (nodes: FileSystemEntry[], indent = '') => {
        for (const node of nodes) {
          const exclusionReason = getExclusionReason(node.path, activeFilters);

          if (node.kind === 'file') {
            const isCode = getPreviewType(node.name) === 'code';
            const isIncluded = node.selected && isCode && !exclusionReason;

            if (isIncluded) {
            } else {
              let reason = "Unknown";
              if (exclusionReason) reason = `Filtered by '${exclusionReason}'`;
              else if (!isCode) reason = "Not a code file";
              else if (!node.selected) reason = "Manually deselected in UI";
            }
          } else if (node.kind === 'directory') {
            const isTraversing = (node.selected || node.indeterminate) && !exclusionReason;
            if (isTraversing) {
              if (node.children) {
                logInclusionStatus(node.children, indent + '  ');
              }
            } else {
              let reason = "Manually deselected in UI";
              if (exclusionReason) reason = `Filtered by '${exclusionReason}'`;
            }
          }
        }
      };
      logInclusionStatus(completeTree);
      // --- End of new logging logic ---


      // The rest of the function remains the same, but now it operates on the fully logged tree.
      setGeneratedText('Phase 2: Gathering all the necessary gizmos and schematics...');
      const filesToProcess: { path: string, handle: FileSystemFileHandle }[] = [];

      const collect = (nodes: FileSystemEntry[]) => {
        for (const node of nodes) {
          if (node.kind === 'file' && node.selected && getPreviewType(node.name) === 'code') {
            filesToProcess.push({ path: node.path, handle: node.handle as FileSystemFileHandle });
          }
          if (node.kind === 'directory' && node.children && (node.selected || node.indeterminate)) {
            collect(node.children);
          }
        }
      };
      collect(completeTree);

      if (filesToProcess.length === 0) {
        setGeneratedText("// My evil scheme resulted in... nothing! Curses!\n// No code files were found based on the current selections and filters.\n// Check the developer console (F12) for a detailed log of why files were skipped.");
        setIsGenerating(false);
        console.groupEnd(); // Make sure to end the group here too
        return;
      }

      setGeneratedText(`Phase 3: Firing the Gemini-Inator! Combining ${filesToProcess.length} files...`);
      let output = '';
      for (const fileInfo of filesToProcess) {
        try {
          const file = await fileInfo.handle.getFile();
          const content = await file.text();
          output += `//--- File: ${fileInfo.path} ---\n\n${content}\n\n`;
        } catch (err: any) {
          output += `//--- File: ${fileInfo.path} ---\n\n--- ERROR: CURSE YOU, PERRY THE PLATYPUS! I COULDN'T READ THIS FILE! (${err.message}) ---\n\n`;
        }
      }
      setGeneratedText(output);

    } catch (err: any) {
      setGeneratedText(`// A catastrophic failure has occurred! My evil scheme is in shambles!\n// ${err.message}`);
      console.error("Error during generation:", err);
    } finally {
      console.groupEnd(); // Always close the console group
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const parts = [];
    if (promptPrefix) parts.push(promptPrefix);
    if (generatedText) parts.push(generatedText);
    if (promptSuffix) parts.push(promptSuffix);
    const textToCopy = parts.join('\n\n');

    if (!textToCopy) return;

    // We know the modern API fails for large text, so we go straight to the
    // classic method. The key is to make this entire operation as synchronous
    // as possible to satisfy browser security policies.

    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;

    // Style the textarea to be invisible but still part of the DOM
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let successful = false;
    try {
      // This is the critical moment. We call execCommand synchronously.
      successful = document.execCommand('copy');
    } catch (err) {
      console.error('An exception occurred during the copy command:', err);
      // Ensure 'successful' is false if an error is thrown.
      successful = false;
    } finally {
      // Crucially, we clean up the textarea immediately, regardless of success.
      document.body.removeChild(textArea);
    }

    // ONLY AFTER the browser-sensitive operation is completely finished,
    // do we trigger any React state updates.
    if (successful) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } else {
      // If even this fails, the browser's restrictions are too great.
      setError("My ultimate scheme... copying... has been foiled! The browser blocked the copy command. This can sometimes be fixed by a page refresh.");
      console.error('Fallback copy method failed. This is likely a browser security restriction.');
    }
  };

  return (
    <div className="min-h-screen p-4 font-sans text-white bg-gray-900 sm:p-6">
      <div className="max-w-[96rem] mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-indigo-400 sm:text-4xl">Behold, the Gemini-Inator!</h1>
          <p className="max-w-3xl mx-auto mt-2 text-gray-400">
            Tired of tedious copy-pasting? My tragic backstory involves a single, misplaced semicolon. But no more! With this device, I will combine any project's code into ONE MIGHTY TEXT FILE! And then... I will finally take over the ENTIRE TRI-STATE AREA'S CODEBASE!
          </p>
        </header>

        {error && (
          <div className="max-w-4xl px-4 py-3 mx-auto mb-6 text-red-300 border border-red-700 rounded-lg bg-red-900/50" role="alert">
            <strong className="font-bold">Curse you, Perry the Platypus! </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <main className="border border-gray-700 rounded-xl overflow-hidden shadow-2xl bg-gray-800/20">
          {initialFileTree.length === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center min-h-[60vh] transition-colors duration-300 ${isDraggingOver ? 'bg-indigo-900/40' : ''
                }`}
            >
              <div className={`p-10 border-2 border-dashed rounded-xl transition-all duration-300 ${isDraggingOver ? 'border-indigo-400 scale-105' : 'border-gray-600'
                }`}>
                <ControlPanel
                  onSelectFolder={handleSelectFolder}
                  isLoading={isLoading}
                  activeFilters={activeFilters}
                  onToggleFilter={handleToggleFilter}
                  onSelectAllFilters={handleSelectAllFilters}
                />
              </div>
              <p className="mt-6 text-gray-400 font-semibold">
                {isDraggingOver ? "Yes! Drop the folder here to begin!" : "Push the button, or drag and drop a folder to begin."}
              </p>
            </div>
          ) : (
            <PanelGroup direction="horizontal" className="min-h-[80vh]">
              {/* --- Panel 1: The Control-Inators --- */}
              <Panel defaultSize={25} minSize={20}>
                <div className="h-full p-1 overflow-y-auto">
                  <ControlPanel
                    onSelectFolder={handleSelectFolder}
                    isLoading={isLoading}
                    activeFilters={activeFilters}
                    onToggleFilter={handleToggleFilter}
                    onSelectAllFilters={handleSelectAllFilters}
                  />
                </div>
              </Panel>

              <PanelResizeHandle className="w-2 bg-gray-800/50 hover:bg-indigo-500/50 transition-colors duration-200" />

              {/* --- Panel 2: The File Gizmos --- */}
              <Panel defaultSize={30} minSize={20}>
                <div className="h-full p-1 overflow-y-auto">
                  <FileExplorer
                    directoryName={directoryName}
                    fileTree={processedFileTree}
                    filterText={filterText}
                    onFilterTextChange={setFilterText}
                    onToggleSelection={handleToggleSelection}
                    onToggleOpen={handleToggleOpen}
                    onToggleAll={handleToggleAll}
                    onPreviewFile={handlePreviewFile}
                  />
                </div>
              </Panel>

              <PanelResizeHandle className="w-2 bg-gray-800/50 hover:bg-indigo-500/50 transition-colors duration-200" />

              {/* --- Panel 3: The Output/Preview Thingy --- */}
              <Panel defaultSize={45} minSize={20}>
                <WorkAreaPanel
                  openTabs={openTabs}
                  activeTabId={activeTabId}
                  onTabClick={setActiveTabId}
                  onCloseTab={handleCloseTab}
                >
                  <OutputPanel
                    generatedText={generatedText}
                    isGenerating={isGenerating}
                    hasFiles={initialFileTree.length > 0}
                    onGenerate={handleGenerate}
                    onCopy={handleCopy}
                    copySuccess={copySuccess}
                    promptPrefix={promptPrefix}
                    onPromptPrefixChange={setPromptPrefix}
                    promptSuffix={promptSuffix}
                    onPromptSuffixChange={setPromptSuffix}
                  />
                </WorkAreaPanel>
              </Panel>
            </PanelGroup>
          )}
        </main>
      </div>
    </div>
  );
}