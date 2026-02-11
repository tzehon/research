import { NavLink, useLocation } from 'react-router-dom';
import {
  Database,
  Settings2,
  RefreshCw,
  Search,
  BarChart3,
  BookOpen,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navSections = [
  {
    label: 'Setup',
    items: [
      {
        name: 'Explorer',
        href: '/explorer',
        icon: Database,
        description: 'Pick a collection',
        requiresConnection: true,
      },
    ],
  },
  {
    label: 'Collect queries',
    hint: 'Run these together — sampling stays active while you generate traffic',
    items: [
      {
        name: 'Sampling',
        href: '/sampling',
        icon: Settings2,
        description: 'configureQueryAnalyzer',
        requiresConnection: true,
      },
      {
        name: 'Workload',
        href: '/workload',
        icon: RefreshCw,
        description: 'Generate traffic (or use your app)',
        requiresConnection: true,
      },
    ],
  },
  {
    label: 'Evaluate',
    hint: 'Can run while sampling is still active',
    items: [
      {
        name: 'Analysis',
        href: '/analysis',
        icon: Search,
        description: 'analyzeShardKey',
        requiresConnection: true,
      },
      {
        name: 'Report',
        href: '/report',
        icon: BarChart3,
        description: 'Compare results',
        requiresConnection: true,
      },
    ],
  },
];

const otherNav = [
  {
    name: 'Guide',
    href: '/guide',
    icon: BookOpen,
    description: 'Learn about shard keys',
    requiresConnection: false,
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { isConnected, selectedDatabase, selectedCollection } = useAtlasConnection();

  return (
    <TooltipProvider>
      <aside className="w-64 border-r bg-card flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b">
          <NavLink to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-mongodb-green flex items-center justify-center">
              <Layers className="w-5 h-5 text-mongodb-slate" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Shard Key</h1>
              <p className="text-xs text-muted-foreground">Analyzer</p>
            </div>
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 cursor-default">
                    {section.label}
                  </div>
                </TooltipTrigger>
                {section.hint && (
                  <TooltipContent side="right" className="max-w-[200px]">
                    <p>{section.hint}</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.href;
                  const isDisabled = item.requiresConnection && !isConnected;

                  return (
                    <Tooltip key={item.name} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={isDisabled ? '#' : item.href}
                          className={cn(
                            'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                            isDisabled && 'opacity-50 cursor-not-allowed'
                          )}
                          onClick={(e) => isDisabled && e.preventDefault()}
                        >
                          <item.icon
                            className={cn(
                              'w-5 h-5 shrink-0',
                              isActive ? 'text-primary' : 'text-muted-foreground'
                            )}
                          />
                          <div className="min-w-0">
                            <span className="block">{item.name}</span>
                            <span className="block text-xs text-muted-foreground truncate">{item.description}</span>
                          </div>
                        </NavLink>
                      </TooltipTrigger>
                      {isDisabled && (
                        <TooltipContent side="right">
                          <p>Connect to MongoDB first</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}

          <Separator className="my-2" />

          {otherNav.map((item) => {
            const isActive = location.pathname === item.href;

            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <item.icon
                  className={cn(
                    'w-5 h-5',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <Separator />

        {/* Selected namespace */}
        <div className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Selected Collection
          </div>
          {selectedDatabase && selectedCollection ? (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <div className="overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {selectedDatabase}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedCollection}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No collection selected
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
