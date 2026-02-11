import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogOut, Server, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { useEffect, useState } from 'react';

export default function Header() {
  const navigate = useNavigate();
  const { isConnected, connectionInfo, disconnect, namespace } = useAtlasConnection();
  const [isDark, setIsDark] = useState(true);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      setIsDark(saved === 'dark');
      document.documentElement.classList.toggle('dark', saved === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(prefersDark);
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle('dark', newIsDark);
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
  };

  const handleDisconnect = async () => {
    await disconnect();
    navigate('/connect');
  };

  return (
    <TooltipProvider>
      <header className="h-14 border-b bg-card flex items-center justify-between px-4">
        {/* Left side - Current context */}
        <div className="flex items-center space-x-4">
          {namespace && (
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="font-mono text-xs">
                {namespace}
              </Badge>
            </div>
          )}
        </div>

        {/* Right side - Connection status & actions */}
        <div className="flex items-center space-x-3">
          {/* Connection status */}
          {isConnected && connectionInfo && (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 text-sm">
                <div className="status-connected" />
                <span className="text-muted-foreground">
                  {connectionInfo.host}
                </span>
                {connectionInfo.isSharded && (
                  <Badge variant="secondary" className="text-xs">
                    <Server className="w-3 h-3 mr-1" />
                    {connectionInfo.shardCount} shards
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-9 w-9"
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle {isDark ? 'light' : 'dark'} mode</p>
            </TooltipContent>
          </Tooltip>

          {/* Disconnect button */}
          {isConnected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDisconnect}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disconnect</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
