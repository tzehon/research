import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Link2, Lock, AlertCircle, Clock, Server, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { storage, parseConnectionHost } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';

export default function ConnectionPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isConnected, isConnecting, connect, recentConnections } = useAtlasConnection();
  const [connectionString, setConnectionString] = useState('');
  const [database, setDatabase] = useState('');
  const [error, setError] = useState('');

  // Redirect if already connected
  useEffect(() => {
    if (isConnected) {
      navigate('/explorer');
    }
  }, [isConnected, navigate]);

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const result = await connect(connectionString, database || undefined);

      toast({
        title: 'Connected to MongoDB Atlas',
        description: `Version ${result.version} • ${result.isSharded ? `${result.shardCount} shards` : 'Not sharded'}`,
        variant: 'success',
      });

      navigate('/explorer');
    } catch (err) {
      setError(err.message);
      toast({
        title: 'Connection failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleRecentClick = (host) => {
    // Pre-fill connection string format
    setConnectionString(`mongodb+srv://username:password@${host}/`);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mongodb-green mb-4">
            <Layers className="w-8 h-8 text-mongodb-slate" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MongoDB Shard Key Analyzer</h1>
          <p className="text-muted-foreground">
            Connect to your MongoDB Atlas cluster to analyze and optimize shard keys
          </p>
        </div>

        {/* Connection Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Link2 className="w-5 h-5" />
              <span>Connect to MongoDB Atlas</span>
            </CardTitle>
            <CardDescription>
              Enter your Atlas connection string to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="connectionString">Connection String</Label>
                <Input
                  id="connectionString"
                  type="password"
                  placeholder="mongodb+srv://user:password@cluster0.xxxxx.mongodb.net"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  className="font-mono text-sm"
                />
                <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  <span>Credentials are not stored</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Database (optional)</Label>
                <Input
                  id="database"
                  placeholder="myDatabase"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start space-x-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!connectionString || isConnecting}
              >
                {isConnecting ? (
                  <>
                    <span className="animate-spin mr-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </span>
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    Connect to Atlas
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          {recentConnections.length > 0 && (
            <>
              <Separator />
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <Label className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>Recent Connections</span>
                  </Label>
                  <div className="space-y-1">
                    {recentConnections.map((host) => (
                      <button
                        key={host}
                        onClick={() => handleRecentClick(host)}
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                      >
                        {host}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Requirements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Requirements</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <div>
                <p className="font-medium">MongoDB Atlas M30+ tier</p>
                <p className="text-muted-foreground">Sharding is not available on lower tiers</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <div>
                <p className="font-medium">MongoDB 7.0 or higher</p>
                <p className="text-muted-foreground">Required for analyzeShardKey command</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <div>
                <p className="font-medium">Network access configured</p>
                <p className="text-muted-foreground">Your IP must be in the Atlas whitelist</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">4</Badge>
              <div>
                <p className="font-medium">Appropriate user role</p>
                <p className="text-muted-foreground">clusterManager or dbAdmin required</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
