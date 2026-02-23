import React, { useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';
import {
  LucideFolder, LucideX, LucideFile, LucideChevronDown, LucideChevronRight,
  LucideCopy, LucideLoader2, LucideSearch, LucideChevronsRight, LucideChevronsLeft,
  LucideFolderOpen, LucideZap, LucideCode2, LucideSettings, LucideFileCode, LucidePlus, LucideBriefcase
} from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Language imports
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
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
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import solidity from 'react-syntax-highlighter/dist/esm/languages/prism/solidity';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const languagesToRegister = { jsx, javascript, typescript, python, rust, css, scss, json, markdown, toml, xml, c, cpp, qml, java, kotlin, protobuf, sql, yaml, bash, solidity };
Object.entries(languagesToRegister).forEach(([name, lang]) => {
  SyntaxHighlighter.registerLanguage(name, lang);
});

// COMMON_EXCLUSIONS
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
  'Compressed Files': (path: string) => ['.rar', '.zip'].some(ext => path.toLowerCase().endsWith(ext)),
  'Image Files': (path: string) => ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].some(ext => path.toLowerCase().endsWith(ext)),
  'Next.js Build (.next/out)': (p) =>
    p === '.next' || p.startsWith('.next/') ||
    p === 'out' || p.startsWith('out/'),
  'Vercel & Turbo Caches': (p) =>
    p === '.vercel' || p.startsWith('.vercel/') ||
    p === '.turbo' || p.startsWith('.turbo/'),
  'pnpm Store/Artifacts': (p) =>
    p === '.pnpm' || p.startsWith('.pnpm/') ||
    p.startsWith('node_modules/.pnpm/') ||
    p.endsWith('pnpm-debug.log'),
  'pnpm Lock & Workspace': (p) =>
    p.endsWith('pnpm-lock.yaml') || p.endsWith('pnpm-workspace.yaml'),
  'GitHub (.github)': (p) => p === '.github' || p.startsWith('.github/'),
  'Cloudflare Wrangler': (p) =>
    p === '.wrangler' || p.startsWith('.wrangler/') ||
    p.endsWith('wrangler.toml') ||
    p.endsWith('wrangler.json') ||
    p.endsWith('.dev.vars'),
  'JSON Files': (p: string) => p.toLowerCase().endsWith('.json'),
  'Husky Hooks': (p: string) =>
    p === '.husky' || p.startsWith('.husky/') ||
    p.endsWith('.huskyrc') ||
    p.endsWith('.huskyrc.js') || p.endsWith('.huskyrc.cjs') ||
    p.endsWith('.huskyrc.json') || p.endsWith('.huskyrc.ts'),
};

const getActiveFilterFns = (activeFilters: Set<string>) => {
  return Array.from(activeFilters)
    .map(name => COMMON_EXCLUSIONS[name])
    .filter((fn): fn is (path: string) => boolean => typeof fn === 'function');
};

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// Helper types/funcs
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

type TabId = 'output' | string;
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

interface ProjectSession {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  initialTree: FileSystemEntry[];
  processedTree: FileSystemEntry[];
  includeOverrides: Set<string>;
  openTabs: FileSystemEntry[];
  activeTabId: TabId;
  promptPrefix: string;
  promptSuffix: string;
  generatedText: string;
  filterText: string;
  isLoading: boolean;
  isGenerating: boolean;
  copySuccess: boolean;
}

const hasOverrideUnder = (dirPath: string, overrides: Set<string>) => {
  const prefix = dirPath ? dirPath + '/' : '';
  for (const id of overrides) {
    if (id === dirPath || id.startsWith(prefix)) return true;
  }
  return false;
};

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
  return entries.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
};

const loadAndInsertChildren = async (
  baseTree: FileSystemEntry[],
  id: string,
  activeFilters: Set<string>,
  includeOverrides: Set<string>
): Promise<FileSystemEntry[]> => {
  const entryToLoad = findEntry(baseTree, id);
  if (!entryToLoad || entryToLoad.kind !== 'directory') return baseTree;

  const rawChildren = await processDirectoryLevel(entryToLoad.handle as FileSystemDirectoryHandle, entryToLoad.path);
  const filterFns = getActiveFilterFns(activeFilters);

  const processedChildren = rawChildren.map(child => {
    const isFiltered = filterFns.some(fn => fn(child.path));
    // If a parent is indeterminate, it still represents a partially-included branch.
    // Newly loaded descendants should remain visible/selected unless explicitly filtered.
    const parentSelected = entryToLoad.selected || !!entryToLoad.indeterminate;
    const overridden = includeOverrides.has(child.id);
    return {
      ...child,
      selected: overridden ? true : (parentSelected && !isFiltered),
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

const applyFiltersAndPreserveOpenState = (
  nodes: FileSystemEntry[],
  activeFilters: Set<string>,
  includeOverrides: Set<string>
): FileSystemEntry[] => {
  const filterFns = getActiveFilterFns(activeFilters);
  const hasActiveFilters = activeFilters.size > 0;
  const isPathFiltered = (p: string) => filterFns.some(fn => fn(p));

  const recurse = (entries: FileSystemEntry[]): FileSystemEntry[] => {
    return entries.map(entry => {
      const wasSelected = !!entry.selected;
      const isFilteredHere = isPathFiltered(entry.path);

      if (entry.kind === 'directory') {
        if (isFilteredHere && !hasOverrideUnder(entry.path, includeOverrides)) {
          return { ...entry, selected: false, indeterminate: false };
        }
        if (entry.children) {
          const newChildren = recurse(entry.children);
          const selectedOrIndeterminate = newChildren.filter(c => c.selected || c.indeterminate).length;
          const allFullySelected = newChildren.length > 0 && newChildren.every(c => c.selected && !c.indeterminate);

          let newSelected = wasSelected;
          let newIndeterminate = false;

          if (newChildren.length === 0) {
            newIndeterminate = hasActiveFilters && wasSelected;
          } else if (allFullySelected) {
            newIndeterminate = false;
          } else if (selectedOrIndeterminate > 0) {
            newIndeterminate = true;
          } else {
            newIndeterminate = hasActiveFilters && wasSelected;
          }
          return { ...entry, children: newChildren, selected: newSelected, indeterminate: newIndeterminate };
        }
        return {
          ...entry,
          selected: wasSelected,
          indeterminate: hasActiveFilters && wasSelected,
        };
      }
      if (includeOverrides.has(entry.id)) {
        return { ...entry, selected: true, indeterminate: false };
      }
      if (isFilteredHere) {
        return { ...entry, selected: false, indeterminate: false };
      }
      return { ...entry, selected: true, indeterminate: false };
    });
  };
  return recurse(nodes);
};

const updateSelectionRecursive = (nodes: FileSystemEntry[], id: string, selected: boolean): FileSystemEntry[] => {
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

  const correctParentStates = (entries: FileSystemEntry[]): FileSystemEntry[] => {
    return entries.map(entry => {
      if (entry.kind !== 'directory' || !entry.children) return entry;
      const newChildren = correctParentStates(entry.children);
      const fullySelectedChildren = newChildren.filter(c => c.selected && !c.indeterminate).length;
      const partiallySelectedChildren = newChildren.filter(c => c.indeterminate).length;
      const totalSelectedDescendants = fullySelectedChildren + partiallySelectedChildren;

      let newSelected = false;
      let newIndeterminate = false;

      if (totalSelectedDescendants === 0) {
        newSelected = false;
        newIndeterminate = false;
      } else if (fullySelectedChildren === newChildren.length) {
        newSelected = true;
        newIndeterminate = false;
      } else {
        newSelected = false;
        newIndeterminate = true;
      }
      return { ...entry, children: newChildren, selected: newSelected, indeterminate: newIndeterminate };
    });
  };
  return correctParentStates(treeWithUpdatedChildren);
};

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

const getPreviewType = (filename: string): 'code' | 'image' | 'video' | 'unsupported' => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const codeExtensions = [
    'js', 'mjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'scss', 'md', 'mdx', 'py', 'rs', 'xml', 'prisma', 'c', 'cpp', 'h', 'qml', 'qrc', 'mo', 'toml', 'txt', 'java', 'kt', 'kts', 'proto', 'gradle', 'move', 'sql', 'yaml', 'yml', 'lock', 'sum', 'sh', 'sol'
  ];
  if (codeExtensions.includes(extension)) return 'code';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(extension)) return 'video';
  return 'unsupported';
};

const getLanguageForPreview = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'sh': return 'bash';
    case 'sol': return 'solidity';
    case 'js': return 'javascript';
    case 'mjs': return 'javascript';
    case 'ts': return 'typescript';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'cpp': return 'cpp';
    case 'h': return 'c';
    case 'qml': return 'qml';
    case 'mo': return 'motoko';
    case 'md': return 'markdown';
    case 'mdx': return 'jsx';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'html': return 'html';
    case 'json': return 'json';
    case 'xml': case 'qrc': return 'xml';
    case 'jsx': case 'tsx': return 'jsx';
    case 'java': return 'java';
    case 'kt': case 'kts': return 'kotlin';
    case 'proto': return 'protobuf';
    case 'move': return 'rust';
    case 'sql': return 'sql';
    case 'yaml': case 'yml': return 'yaml';
    case 'lock': return 'plaintext';
    case 'sum': return 'plaintext';
    case 'txt':
    default: return 'plaintext';
  }
};

// --- COMPONENTS ---

const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id: string;
}> = ({ checked, indeterminate, onChange, id }) => {
  const ref = useRef<HTMLInputElement>(null!);
  useEffect(() => { ref.current.indeterminate = indeterminate || false; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      className="form-checkbox h-4 w-4 rounded bg-gray-900 border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900 cursor-pointer"
    />
  );
};

const TokenBar: React.FC<{ charCount: number, tokenCount: number }> = React.memo(({ charCount, tokenCount }) => {
  const LIMITS = [
    { label: '32k', val: 32000 },
    { label: '128k', val: 128000 },
    { label: '1M', val: 1000000 }
  ];

  const activeLimit = LIMITS.find(l => tokenCount < l.val) || LIMITS[LIMITS.length - 1];
  const percent = Math.min((tokenCount / activeLimit.val) * 100, 100);

  return (
    <div className="flex flex-col w-36 group cursor-help select-none">
      <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1 uppercase tracking-wider">
        <span className="text-purple-300 font-bold">{tokenCount.toLocaleString()}</span>
        <span className="opacity-50">/ {activeLimit.label}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
        <div
          className={`h-full transition-all duration-500 ${percent > 90 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-gradient-to-r from-purple-600 to-indigo-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
});

// Component: Top Navigation Bar with Tabs
const TopBar: React.FC<{
  sessions: ProjectSession[];
  activeSessionId: string | null;
  onSwitchSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onSelectFolder: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  activeSession?: ProjectSession;
}> = ({ sessions, activeSessionId, onSwitchSession, onCloseSession, onSelectFolder, onGenerate, isGenerating, activeSession }) => {

  const { charCount, tokenCount } = useMemo(() => {
    if (!activeSession) return { charCount: 0, tokenCount: 0 };
    const parts = [activeSession.promptPrefix, activeSession.generatedText, activeSession.promptSuffix].filter(Boolean).join('\n\n');
    const chars = parts.length;
    return { charCount: chars, tokenCount: Math.ceil(chars / 4) };
  }, [activeSession?.generatedText, activeSession?.promptPrefix, activeSession?.promptSuffix]);

  return (
    <div className="glass-header h-14 flex items-center justify-between shrink-0 z-20 gap-4 select-none relative border-b border-purple-900/30">

      {/* 1. Left: Branding & Controls */}
      <div className="flex items-center pl-4 shrink-0">
        <div className="flex items-center gap-2.5 mr-6">
          <div className="p-1.5 bg-gradient-to-br from-purple-900/80 to-indigo-900/80 rounded-md border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)] group">
            <LucideZap className="text-purple-300 group-hover:text-yellow-300 transition-colors" size={18} />
          </div>
          <div className="hidden md:block">
            <h1 className="font-bold text-gray-100 text-sm tracking-tight">Gemini-Inator <span className="text-purple-400 text-[10px] align-top">3000</span></h1>
            <p className="text-[9px] text-gray-500 leading-none -mt-0.5">Evil Inc.</p>
          </div>
        </div>

        <div className="h-6 w-px bg-gray-800 mr-4" />

        <button
          onClick={onSelectFolder}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800/50 text-gray-400 hover:bg-purple-600 hover:text-white border border-gray-700 hover:border-purple-500 transition-all shadow-sm hover:shadow-[0_0_10px_rgba(147,51,234,0.3)]"
          title="New Scheme Target"
        >
          <LucidePlus size={16} />
        </button>
      </div>

      {/* 2. Middle: Scrollable Tabs */}
      <div className="flex-1 flex items-center overflow-x-auto custom-scrollbar px-2 mask-linear-fade h-full">
        <div className="flex items-center gap-1.5 h-9">
          {sessions.map(session => {
            const isActive = activeSessionId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => onSwitchSession(session.id)}
                className={`
                  group relative flex items-center gap-2 px-3 pl-3 pr-2 h-full rounded-md border cursor-pointer transition-all min-w-[140px] max-w-[220px]
                  ${isActive
                    ? 'bg-gray-800/90 border-purple-500/30 text-gray-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]'
                    : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-800/30 hover:text-gray-300 hover:border-gray-800'
                  }
                `}
              >
                <LucideBriefcase size={13} className={`shrink-0 ${isActive ? "text-purple-400" : "text-gray-600 group-hover:text-gray-500"}`} />
                <span className="text-xs font-medium truncate flex-1 pt-0.5">{session.name}</span>

                <button
                  onClick={(e) => { e.stopPropagation(); onCloseSession(session.id); }}
                  className={`
                    p-0.5 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-all
                    ${isActive ? 'opacity-100 text-gray-500' : 'opacity-0 group-hover:opacity-100 text-gray-600'}
                  `}
                >
                  <LucideX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Right: Stats & Action */}
      <div className="flex items-center gap-5 pr-4 pl-4 bg-gradient-to-l from-[#0f172a] via-[#0f172a] to-transparent shrink-0 h-full">
        {activeSession && activeSession.initialTree.length > 0 && (
          <TokenBar charCount={charCount} tokenCount={tokenCount} />
        )}

        <button
          onClick={onGenerate}
          disabled={!activeSession || isGenerating || activeSession.initialTree.length === 0}
          className={`
            relative overflow-hidden flex items-center px-5 py-1.5 rounded-md font-bold text-xs text-white shadow-lg transition-all 
            disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale
            ${isGenerating
              ? 'bg-gray-800 border border-gray-700 cursor-wait'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 hover:shadow-[0_0_15px_rgba(124,58,237,0.4)] border border-transparent'
            }
          `}
        >
          <div className="relative z-10 flex items-center gap-2">
            {isGenerating ? (
              <LucideLoader2 className="animate-spin text-purple-200" size={14} />
            ) : (
              <LucideZap className="fill-current text-purple-100" size={14} />
            )}
            <span className="tracking-wide font-bold uppercase">{isGenerating ? 'CONCOCTING...' : 'BEHOLD!'}</span>
          </div>
        </button>
      </div>
    </div>
  );
};

const Sidebar: React.FC<{
  fileTree: FileSystemEntry[];
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onToggleSelection: (id: string, selected: boolean) => void;
  onToggleOpen: (id: string) => void;
  onToggleAll: (isOpen: boolean) => void;
  onPreviewFile: (entry: FileSystemEntry) => void;
  activeFilters: Set<string>;
  onToggleFilter: (name: string) => void;
  onSelectAllFilters: () => void;
}> = ({ fileTree, filterText, onFilterTextChange, onToggleSelection, onToggleOpen, onToggleAll, onPreviewFile, activeFilters, onToggleFilter, onSelectAllFilters }) => {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex flex-col h-full glass-panel rounded-r-xl border-l-0 border-y-0">
      <div className="p-4 border-b border-gray-700/50 bg-gray-900/30">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-grow group">
            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search gizmos..."
              value={filterText}
              onChange={(e) => onFilterTextChange(e.target.value)}
              className="w-full py-2 pl-9 pr-4 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-purple-900/50 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
            title="Toggle Filters"
          >
            <LucideSettings size={18} />
          </button>
        </div>

        {/* Collapsible Filter Area */}
        {showFilters && (
          <div className="mb-3 p-3 bg-gray-900/80 rounded-lg border border-gray-700/50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ignore-Inators</span>
              <button onClick={onSelectAllFilters} className="text-xs text-purple-400 hover:text-purple-300">Reset All</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {Object.keys(COMMON_EXCLUSIONS).map((name) => (
                <button
                  key={name}
                  onClick={() => onToggleFilter(name)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors border ${activeFilters.has(name)
                    ? 'bg-red-900/30 border-red-800 text-red-300 hover:bg-red-900/50'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-gray-500 px-1">
          <span>FILES</span>
          <div className="flex gap-1">
            <button onClick={() => onToggleAll(true)} className="hover:text-white" title="Expand All"><LucideChevronsRight size={14} /></button>
            <button onClick={() => onToggleAll(false)} className="hover:text-white" title="Collapse All"><LucideChevronsLeft size={14} /></button>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-2 custom-scrollbar">
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
};

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
          if (filteredChildren.length > 0) acc.push({ ...item, children: filteredChildren });
        }
        return acc;
      }, [] as FileSystemEntry[]);
    };
    return filter(entries);
  }, [entries, filterText]);

  if (filteredEntries.length === 0 && filterText.length > 0) {
    return <div className="p-4 text-center text-gray-500 text-sm">No gizmos found.</div>;
  }

  return (
    <ul className="pl-1 space-y-0.5">
      {filteredEntries.map(entry => (
        <li key={entry.id}>
          <div className={`flex items-center py-1 px-2 rounded-md transition-colors group ${entry.selected ? 'bg-purple-900/10' : ''} hover:bg-gray-800`}>
            <IndeterminateCheckbox
              id={`cb-${entry.id}`}
              checked={entry.selected}
              indeterminate={entry.indeterminate}
              onChange={(e) => onToggleSelection(entry.id, e.target.checked)}
            />
            <div className="flex items-center flex-1 min-w-0 ml-2">
              {entry.kind === 'directory' ? (
                <button
                  onClick={() => onToggleOpen(entry.id)}
                  className="flex items-center text-gray-400 hover:text-white focus:outline-none"
                >
                  {entry.isLoadingChildren ? (
                    <LucideLoader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    entry.isOpen ? <LucideChevronDown size={14} className="mr-1.5" /> : <LucideChevronRight size={14} className="mr-1.5" />
                  )}
                  <LucideFolder size={14} className={`mr-2 ${entry.selected || entry.indeterminate ? 'text-amber-400' : 'text-gray-500'}`} />
                  <span className="truncate text-sm text-gray-300 group-hover:text-white select-none">{entry.name}</span>
                </button>
              ) : (
                <button
                  onClick={() => onPreviewFile(entry)}
                  className="flex items-center flex-1 min-w-0 text-left focus:outline-none"
                >
                  <LucideFileCode size={14} className={`mr-2 shrink-0 ${entry.selected ? 'text-blue-400' : 'text-gray-600'}`} />
                  <span className={`truncate text-sm group-hover:text-white transition-colors ${entry.selected ? 'text-gray-200' : 'text-gray-500'}`}>
                    {entry.name}
                  </span>
                </button>
              )}
            </div>
          </div>
          {entry.kind === 'directory' && entry.isOpen && entry.children && (
            <div className="ml-4 border-l border-gray-800">
              <FileTree
                entries={entry.children}
                filterText=""
                onToggleSelection={onToggleSelection}
                onToggleOpen={onToggleOpen}
                onPreviewFile={onPreviewFile}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

const PreviewPanel: React.FC<{
  file: FileSystemEntry;
  content: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}> = ({ file, content, isLoading, error, onClose }) => {
  const previewType = getPreviewType(file.name);
  const FixedSyntaxHighlighter = SyntaxHighlighter as any;

  return (
    <div className="flex flex-col h-full bg-gray-900/50">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2 overflow-hidden">
          <LucideFileCode size={16} className="text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-gray-300 truncate font-mono">{file.path}</span>
        </div>
      </div>
      <div className="flex-grow overflow-auto relative custom-scrollbar">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <LucideLoader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">
            <p className="font-bold mb-2">Error Reading File</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        ) : !content ? (
          <div className="p-8 text-center text-gray-500">Empty file.</div>
        ) : previewType === 'code' ? (
          <FixedSyntaxHighlighter
            language={getLanguageForPreview(file.name)}
            style={vscDarkPlus}
            customStyle={{ background: 'transparent', margin: 0, padding: '1.5rem', fontSize: '13px', lineHeight: '1.5' }}
            showLineNumbers={true}
            lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#64748b', textAlign: 'right' }}
          >
            {content}
          </FixedSyntaxHighlighter>
        ) : previewType === 'image' ? (
          <div className="flex items-center justify-center h-full p-4">
            <img src={content} alt="Preview" className="max-w-full max-h-full object-contain rounded border border-gray-700" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">Unsupported preview.</div>
        )}
      </div>
    </div>
  );
};

// --- OPTIMIZED OUTPUT VIEWER ---
// This component is wrapped in React.memo to prevent re-rendering the heavy SyntaxHighlighter
// when the user types in the prefix/suffix textareas.
// 1. Update MemoizedCodeViewer
const MemoizedCodeViewer = React.memo(({ generatedText, isTooLarge }: { generatedText: string, isTooLarge: boolean }) => {
  const FixedSyntaxHighlighter = SyntaxHighlighter as any;

  if (!generatedText) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50 select-none">
        <LucideCode2 size={48} className="mb-4" />
        <p>The Inator hasn't fired yet...</p>
      </div>
    );
  }

  if (isTooLarge) {
    return (
      <textarea readOnly value={generatedText} className="w-full h-full p-4 bg-transparent text-gray-300 font-mono text-xs border-none resize-none focus:ring-0" />
    );
  }

  return (
    <FixedSyntaxHighlighter
      language="javascript"
      style={vscDarkPlus}
      // overflow-visible allows the PARENT div to handle scrolling
      customStyle={{ background: 'transparent', margin: 0, padding: '1.5rem', minHeight: '100%', fontSize: '12px', overflow: 'visible' }}
      wrapLines={true} // Helps with horizontal scrolling issues
    >
      {generatedText}
    </FixedSyntaxHighlighter>
  );
});

// 2. Update OutputPanel
const OutputPanel: React.FC<{
  generatedText: string;
  promptPrefix: string;
  onPromptPrefixChange: (value: string) => void;
  promptSuffix: string;
  onPromptSuffixChange: (value: string) => void;
  onCopy: () => void;
  copySuccess: boolean;
}> = ({ generatedText, promptPrefix, onPromptPrefixChange, promptSuffix, onPromptSuffixChange, onCopy, copySuccess }) => {
  const SYNTAX_HIGHLIGHT_LIMIT = 200000;
  const isTooLarge = useMemo(() => generatedText.length > SYNTAX_HIGHLIGHT_LIMIT, [generatedText.length]);

  return (
    <div className="flex flex-col h-full bg-gray-900/50">
      <div className="flex-grow flex flex-col min-h-0">

        {/* Prefix Input Area */}
        <div className="p-4 space-y-4 border-b border-gray-800 bg-gray-900/30 shrink-0">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Evil Context (Prefix)</label>
            <textarea
              value={promptPrefix}
              onChange={(e) => onPromptPrefixChange(e.target.value)}
              placeholder="e.g., 'Ah, Perry the Platypus! Analyze this React code and tell me why my traps aren't working...'"
              className="w-full p-2 text-sm bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 focus:ring-1 focus:ring-purple-500 outline-none resize-none h-16 transition-all placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* Output Area - SCROLL FIX HERE */}
        <div className="relative flex-grow min-h-0">
          <div className="absolute top-2 right-4 z-10">
            <button
              onClick={onCopy}
              disabled={!generatedText}
              className={`flex items-center px-3 py-1.5 text-xs font-bold rounded-md shadow-lg transition-all ${copySuccess ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'}`}
            >
              {copySuccess ? <span className="mr-1 uppercase">Stolen!</span> : <LucideCopy size={14} className="mr-1.5" />}
              {copySuccess ? '' : 'STEAL CODE'}
            </button>
          </div>

          {/* 
              Changed 'overflow-hidden' to 'overflow-auto' (or 'overflow-y-auto')
              This div allows scrolling of the content inside it. 
          */}
          <div className="h-full w-full overflow-auto custom-scrollbar bg-[#1e1e1e]">
            <MemoizedCodeViewer generatedText={generatedText} isTooLarge={isTooLarge} />
          </div>
        </div>

        {/* Suffix Input Area */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/30 shrink-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Self-Destruct Instructions (Suffix)</label>
          <textarea
            value={promptSuffix}
            onChange={(e) => onPromptSuffixChange(e.target.value)}
            placeholder="e.g., 'Find the self-destruct button... I mean, bugs.'"
            className="w-full p-2 text-sm bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 focus:ring-1 focus:ring-purple-500 outline-none resize-none h-16 transition-all placeholder:text-gray-600"
          />
        </div>
      </div>
    </div>
  );
};

const WorkAreaPanel: React.FC<WorkAreaPanelProps> = ({ openTabs, activeTabId, onTabClick, onCloseTab, children }) => {
  const [preview, setPreview] = useState<PreviewState>({ content: '', isLoading: false, error: null, type: 'unsupported' });
  const activeFile = useMemo(() => openTabs.find(tab => tab.id === activeTabId), [openTabs, activeTabId]);

  useEffect(() => {
    if (activeTabId === 'output' || !activeFile) return;
    const loadContent = async (fileEntry: FileSystemEntry) => {
      setPreview({ content: '', isLoading: true, error: null, type: 'unsupported' });
      const previewType = getPreviewType(fileEntry.name);
      if (previewType === 'unsupported') {
        setPreview({ content: '', isLoading: false, error: "Unsupported file type.", type: 'unsupported' });
        return;
      }
      try {
        const fileHandle = fileEntry.handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        if (previewType === 'code') {
          if (file.size > 5 * 1024 * 1024) throw new Error("File too large.");
          const text = await file.text();
          setPreview({ content: text, isLoading: false, error: null, type: 'code' });
        } else {
          const url = URL.createObjectURL(file);
          setPreview({ content: url, isLoading: false, error: null, type: previewType });
        }
      } catch (err: any) {
        setPreview({ content: '', isLoading: false, error: err.message, type: 'unsupported' });
      }
    };
    loadContent(activeFile);
    return () => { if (preview.content && preview.content.startsWith('blob:')) URL.revokeObjectURL(preview.content); };
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
    <div className="flex flex-col h-full glass-panel rounded-l-xl border-r-0 border-y-0 overflow-hidden">
      <div className="flex items-end bg-gray-900/50 border-b border-gray-700/50 px-2 pt-2 gap-1 overflow-x-auto custom-scrollbar shrink-0">
        <button
          onClick={() => onTabClick('output')}
          className={`flex items-center px-4 py-2 text-xs font-medium rounded-t-lg transition-all ${activeTabId === 'output' ? 'bg-gray-800 text-purple-400 border-t border-x border-gray-700' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
        >
          <LucideZap size={14} className="mr-2" /> Output
        </button>
        {openTabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center group px-3 py-2 text-xs font-medium rounded-t-lg max-w-[150px] transition-all border-t border-x ${activeTabId === tab.id ? 'bg-gray-800 text-blue-400 border-gray-700' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
            onClick={() => onTabClick(tab.id)}
          >
            <LucideFile size={12} className="mr-2 shrink-0" />
            <span className="truncate cursor-pointer">{tab.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="ml-2 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all"
            >
              <LucideX size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex-grow overflow-hidden bg-[#0f172a]">
        {renderContent()}
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

const FILTERS_STORAGE_KEY = 'doofenshmirtz_evil_incorporated_filters';

export default function App() {
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Global filter settings (shared across sessions for now, could be per-session if preferred)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => {
    try {
      const savedFilters = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        if (Array.isArray(parsed)) {
          const validFilters = parsed.filter(
            (name): name is string => typeof name === 'string' && typeof COMMON_EXCLUSIONS[name] === 'function'
          );
          return new Set(validFilters);
        }
      }
    } catch (e) { console.error(e); }
    return new Set();
  });

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);

  // Persist filters
  useEffect(() => {
    try { window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(Array.from(activeFilters))); } catch (e) { }
  }, [activeFilters]);

  // Apply filters to active session whenever filters change
  useEffect(() => {
    if (!activeSessionId) return;

    setSessions(prevSessions => prevSessions.map(session => {
      // Optimization: Only re-process if the filters actually changed state logic
      // But for simplicity, we re-run the filter logic on the active session tree
      const newlyProcessedTree = applyFiltersAndPreserveOpenState(
        session.initialTree,
        activeFilters,
        session.includeOverrides
      );
      return { ...session, processedTree: newlyProcessedTree };
    }));
  }, [activeFilters]);

  const createNewSession = async (directoryHandle: FileSystemDirectoryHandle) => {
    const id = createSessionId();
    const tree = await processDirectoryLevel(directoryHandle);
    const processedTree = applyFiltersAndPreserveOpenState(tree, activeFilters, new Set());

    const newSession: ProjectSession = {
      id,
      name: directoryHandle.name,
      handle: directoryHandle,
      initialTree: tree,
      processedTree,
      includeOverrides: new Set(),
      openTabs: [],
      activeTabId: 'output',
      promptPrefix: '',
      promptSuffix: '',
      generatedText: '',
      filterText: '',
      isLoading: false,
      isGenerating: false,
      copySuccess: false,
    };

    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(id);
  };

  const handleSelectFolder = async () => {
    if (!('showDirectoryPicker' in window)) { setError('Browser not supported.'); return; }
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await createNewSession(directoryHandle);
    } catch (err: any) { if (err.name !== 'AbortError') setError(err.message); }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); };
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false);
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const handle = await items[0].getAsFileSystemHandle();
      if (handle && handle.kind === 'directory') await createNewSession(handle as FileSystemDirectoryHandle);
      else setError("Not a folder!");
    }
  };

  // Helper to update the current session state
  const updateActiveSession = (updateFn: (session: ProjectSession) => Partial<ProjectSession>) => {
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, ...updateFn(s) };
      }
      return s;
    }));
  };

  // --- Session State Handlers ---

  const handleToggleSelection = useCallback((id: string, selected: boolean) => {
    if (!activeSessionId) return;

    setSessions(prev => prev.map(session => {
      if (session.id !== activeSessionId) return session;

      const newProcessedTree = updateSelectionRecursive(session.processedTree, id, selected);

      // Update overrides
      const newOverrides = new Set(session.includeOverrides);
      const entry = findEntry(newProcessedTree, id);
      if (entry && entry.kind === 'file') {
        if (selected) newOverrides.add(id); else newOverrides.delete(id);
      }

      return {
        ...session,
        processedTree: newProcessedTree,
        includeOverrides: newOverrides
      };
    }));
  }, [activeSessionId]);

  const handleToggleAll = useCallback((isOpen: boolean) => {
    updateActiveSession(s => ({ processedTree: toggleAllFolders(s.processedTree, isOpen) }));
  }, [activeSessionId]);

  const handleToggleFilter = (name: string) => { setActiveFilters(prev => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; }); };
  const handleSelectAllFilters = () => { setActiveFilters(new Set(Object.keys(COMMON_EXCLUSIONS))); };

  const handleToggleOpen = useCallback((id: string) => {
    if (!activeSessionId) return;

    // Use a functional update to access the latest state safely
    setSessions(prevSessions => {
      const sessionIndex = prevSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex === -1) return prevSessions;

      const session = prevSessions[sessionIndex];
      const entryToToggle = findEntry(session.processedTree, id);
      if (!entryToToggle) return prevSessions;

      const needsToLoad = entryToToggle.kind === 'directory' && entryToToggle.children === undefined;

      // 1. Immediate update for UI feedback (spinner or toggle)
      const buildNewTree = (nodes: FileSystemEntry[]): FileSystemEntry[] => {
        return nodes.map(entry => {
          if (entry.id === id) return { ...entry, isOpen: needsToLoad ? true : !entry.isOpen, isLoadingChildren: needsToLoad };
          if (entry.children) return { ...entry, children: buildNewTree(entry.children) };
          return entry;
        });
      };

      const treeWithSpinner = buildNewTree(session.processedTree);

      const updatedSessions = [...prevSessions];
      updatedSessions[sessionIndex] = { ...session, processedTree: treeWithSpinner };

      // 2. Async load if needed (Side effect inside handler - unusual but effective for this structure)
      if (needsToLoad) {
        loadAndInsertChildren(treeWithSpinner, id, activeFilters, session.includeOverrides)
          .then(finalTree => {
            setSessions(current => current.map(s =>
              s.id === activeSessionId ? { ...s, processedTree: finalTree } : s
            ));
          })
          .catch(err => console.error(err));
      }

      return updatedSessions;
    });
  }, [activeSessionId, activeFilters]);

  const handlePreviewFile = useCallback((entry: FileSystemEntry) => {
    if (entry.kind !== 'file') return;
    updateActiveSession(s => {
      if (s.openTabs.find(tab => tab.id === entry.id)) return { activeTabId: entry.id };
      return { openTabs: [...s.openTabs, entry], activeTabId: entry.id };
    });
  }, [activeSessionId]);

  const handleCloseTab = useCallback((tabId: TabId) => {
    updateActiveSession(s => {
      const tabIndex = s.openTabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return {};
      let newActiveId = s.activeTabId;
      if (s.activeTabId === tabId) newActiveId = s.openTabs[tabIndex - 1]?.id || 'output';
      return {
        openTabs: s.openTabs.filter(tab => tab.id !== tabId),
        activeTabId: newActiveId
      };
    });
  }, [activeSessionId]);

  const handleTabClick = (id: TabId) => updateActiveSession(() => ({ activeTabId: id }));

  // ... (Keep buildCompleteTree) ...
  const buildCompleteTree = async (nodes: FileSystemEntry[], activeFilters: Set<string>, includeOverrides: Set<string>): Promise<FileSystemEntry[]> => {
    const newNodes: FileSystemEntry[] = [];
    const filterFns = getActiveFilterFns(activeFilters);
    for (const node of nodes) {
      const isFiltered = filterFns.some(fn => fn(node.path));
      if (node.kind === 'file') {
        if (isFiltered && !includeOverrides.has(node.id)) continue;
        newNodes.push(node);
        continue;
      }
      const dirHasOverride = hasOverrideUnder(node.path, includeOverrides);
      const skipDir = isFiltered && !dirHasOverride;
      if (skipDir) continue;
      const mustTraverse = dirHasOverride || node.selected || node.indeterminate;
      if (mustTraverse && node.children === undefined) {
        try {
          const rawChildren = await processDirectoryLevel(node.handle as FileSystemDirectoryHandle, node.path);
          const expandedChildren = await buildCompleteTree(rawChildren, activeFilters, includeOverrides);
          newNodes.push({ ...node, children: expandedChildren });
        } catch { newNodes.push({ ...node, children: [] }); }
      } else if (node.children) {
        const expandedChildren = await buildCompleteTree(node.children, activeFilters, includeOverrides);
        newNodes.push({ ...node, children: expandedChildren });
      } else { newNodes.push(node); }
    }
    return newNodes;
  };

  const handleGenerate = async () => {
    if (!activeSession) return;
    updateActiveSession(() => ({ isGenerating: true, generatedText: 'Phase 1: Analyzing schemes...' }));

    try {
      const completeTree = await buildCompleteTree(activeSession.processedTree, activeFilters, activeSession.includeOverrides);
      updateActiveSession(() => ({ generatedText: 'Phase 2: Gathering gizmos...' }));

      const filesToProcess: { path: string, handle: FileSystemFileHandle }[] = [];
      const collect = (nodes: FileSystemEntry[]) => {
        for (const node of nodes) {
          if (node.kind === 'file' && node.selected && getPreviewType(node.name) === 'code') {
            filesToProcess.push({ path: node.path, handle: node.handle as FileSystemFileHandle });
          }
          if (node.kind === 'directory' && node.children && (node.selected || node.indeterminate)) collect(node.children);
        }
      };
      collect(completeTree);

      if (filesToProcess.length === 0) {
        updateActiveSession(() => ({ generatedText: "// My evil scheme resulted in... nothing! No code files found.", isGenerating: false }));
        return;
      }

      updateActiveSession(() => ({ generatedText: `Phase 3: Firing the Inator! Combining ${filesToProcess.length} files...` }));

      let output = '';
      for (const fileInfo of filesToProcess) {
        try {
          const file = await fileInfo.handle.getFile();
          const content = await file.text();
          output += `//--- File: ${fileInfo.path} ---\n\n${content}\n\n`;
        } catch (err: any) { output += `//--- File: ${fileInfo.path} ---\n\n--- ERROR: ${err.message} ---\n\n`; }
      }
      updateActiveSession(() => ({ generatedText: output, isGenerating: false }));
    } catch (err: any) {
      updateActiveSession(() => ({ generatedText: `// Failure! ${err.message}`, isGenerating: false }));
    }
  };

  const handleCopy = () => {
    if (!activeSession) return;
    const parts = [activeSession.promptPrefix, activeSession.generatedText, activeSession.promptSuffix].filter(Boolean).join('\n\n');
    if (!parts) return;
    const textArea = document.createElement('textarea');
    textArea.value = parts;
    textArea.style.position = 'fixed'; textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    try {
      if (document.execCommand('copy')) {
        updateActiveSession(() => ({ copySuccess: true }));
        setTimeout(() => updateActiveSession(() => ({ copySuccess: false })), 2000);
      }
    }
    catch (e) { setError("Copy failed."); }
    finally { document.body.removeChild(textArea); }
  };

  const closeSession = (id: string) => {
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      return remaining;
    });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-300 font-sans selection:bg-purple-500/30 selection:text-white">
      <TopBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSwitchSession={setActiveSessionId}
        onCloseSession={closeSession}
        onSelectFolder={handleSelectFolder}
        onGenerate={handleGenerate}
        isGenerating={activeSession?.isGenerating || false}
        activeSession={activeSession}
      />

      <main className="flex-grow flex overflow-hidden p-4 pt-2 gap-4">
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-red-900/90 border border-red-500 rounded-lg shadow-2xl text-white backdrop-blur-md">
            <div className="font-bold mb-1">Error!</div>
            {error}
            <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1 hover:bg-red-800 rounded"><LucideX size={16} /></button>
          </div>
        )}

        {!activeSession ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-grow flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${isDraggingOver ? 'border-purple-500 bg-purple-900/20 scale-[0.99]' : 'border-gray-700 bg-gray-900/30'}`}
          >
            <div className="p-12 text-center max-w-lg">
              <div className="mb-6 inline-flex p-6 rounded-full bg-gray-800/50 shadow-2xl ring-1 ring-white/10 group">
                <LucideFolderOpen size={64} className="text-purple-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Ah, Perry the Platypus!</h2>
              <p className="text-gray-400 mb-8 text-lg">
                You've discovered my <span className="text-purple-400 font-mono">Code-Aggregator-Inator</span>!
                <br />
                Drag a folder here to begin my evil scheme!
              </p>
              <button
                onClick={handleSelectFolder}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg shadow-purple-900/50 transition-all hover:scale-105 uppercase tracking-wide"
              >
                Select Target Area
              </button>
            </div>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full">
            {/* Sidebar: File Tree */}
            <Panel defaultSize={25} minSize={15} maxSize={40} className="flex flex-col">
              <Sidebar
                fileTree={activeSession.processedTree}
                filterText={activeSession.filterText}
                onFilterTextChange={(txt) => updateActiveSession(() => ({ filterText: txt }))}
                onToggleSelection={handleToggleSelection}
                onToggleOpen={handleToggleOpen}
                onToggleAll={handleToggleAll}
                onPreviewFile={handlePreviewFile}
                activeFilters={activeFilters}
                onToggleFilter={handleToggleFilter}
                onSelectAllFilters={handleSelectAllFilters}
              />
            </Panel>

            <PanelResizeHandle className="w-1.5 mx-1 rounded bg-gray-800 hover:bg-purple-500/50 transition-colors cursor-col-resize" />

            {/* Main Area: Preview & Output */}
            <Panel defaultSize={75} minSize={30}>
              <WorkAreaPanel
                openTabs={activeSession.openTabs}
                activeTabId={activeSession.activeTabId}
                onTabClick={handleTabClick}
                onCloseTab={handleCloseTab}
              >
                <OutputPanel
                  generatedText={activeSession.generatedText}
                  promptPrefix={activeSession.promptPrefix}
                  onPromptPrefixChange={(txt) => updateActiveSession(() => ({ promptPrefix: txt }))}
                  promptSuffix={activeSession.promptSuffix}
                  onPromptSuffixChange={(txt) => updateActiveSession(() => ({ promptSuffix: txt }))}
                  onCopy={handleCopy}
                  copySuccess={activeSession.copySuccess}
                />
              </WorkAreaPanel>
            </Panel>
          </PanelGroup>
        )}
      </main>
    </div>
  );
}
