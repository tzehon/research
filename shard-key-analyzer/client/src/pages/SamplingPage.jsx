import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  RefreshCw,
  Activity,
  Clock,
  FileSearch,
  TrendingUp,
  ArrowRight,
  Info,
  Trash2,
  Code,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { useSampling } from '@/hooks/useSampling';
import { formatNumber, formatDuration, formatRelativeTime, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export default function SamplingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedDatabase, selectedCollection, namespace } = useAtlasConnection();
  const [samplesPerSecond, setSamplesPerSecond] = useState(10);
  const [rawModalOpen, setRawModalOpen] = useState(false);

  const {
    isActive,
    status,
    queries,
    totalQueries,
    queriesByType,
    start,
    stop,
    updateRate,
    clear,
    isStarting,
    isStopping,
    isClearing,
    error,
  } = useSampling(selectedDatabase, selectedCollection);

  const handleStart = async () => {
    try {
      await start(samplesPerSecond);
      toast({
        title: 'Sampling started',
        description: `Sampling ${samplesPerSecond} queries per second`,
      });
    } catch (err) {
      toast({
        title: 'Failed to start sampling',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleStop = async () => {
    try {
      await stop();
      toast({
        title: 'Sampling stopped',
        description: `Total queries sampled: ${formatNumber(totalQueries)}`,
      });
    } catch (err) {
      toast({
        title: 'Failed to stop sampling',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateRate = async (value) => {
    setSamplesPerSecond(value[0]);
    if (isActive) {
      try {
        await updateRate(value[0]);
      } catch (err) {
        // Ignore rate update errors
      }
    }
  };

  const handleClear = async () => {
    try {
      await clear();
      toast({
        title: 'Sampled queries cleared',
        description: 'All previously sampled queries have been removed.',
      });
    } catch (err) {
      const isAuthError = err.message?.includes('not authorized');
      toast({
        title: 'Failed to clear queries',
        description: isAuthError
          ? 'Your database user needs the clusterManager role to delete from config.sampledQueries.'
          : err.message,
        variant: 'destructive',
      });
    }
  };

  if (!namespace) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardContent className="py-12 text-center">
            <FileSearch className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Select a collection first</p>
            <Button variant="link" onClick={() => navigate('/explorer')}>
              Go to Explorer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Query Sampling</h1>
        <p className="text-muted-foreground">
          Configure query sampling to understand your workload patterns
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sampling Configuration */}
        <div className="col-span-5 space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Sampling Status</span>
                <div className="flex items-center space-x-2">
                  {(status?.lastCommand || status?.lastResponse) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRawModalOpen(true)}
                      className="text-xs text-muted-foreground"
                    >
                      <Code className="w-3 h-3 mr-1" />
                      Raw
                    </Button>
                  )}
                  <Badge variant={isActive ? 'success' : 'secondary'}>
                    {isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isActive && status && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span>{new Date(status.startedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{formatDuration(status.durationSeconds || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate</span>
                    <span>{status.samplesPerSecond}/sec</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sampling Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sampling Rate</CardTitle>
              <CardDescription>
                Higher rates capture more queries but fill storage faster
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Samples per second</span>
                  <span className="font-mono font-medium">{samplesPerSecond}</span>
                </div>
                <Slider
                  value={[samplesPerSecond]}
                  onValueChange={handleUpdateRate}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>50</span>
                </div>
              </div>

              <div className="flex items-start space-x-2 p-3 rounded-lg bg-muted text-sm">
                <Info className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Maximum 50 samples/sec. For best results, sample during peak traffic.
                </span>
              </div>

              <div className="flex space-x-3">
                {isActive ? (
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="flex-1"
                    disabled={isStopping}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Sampling
                  </Button>
                ) : (
                  <Button
                    onClick={handleStart}
                    className="flex-1"
                    disabled={isStarting}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Sampling
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <Info className="w-5 h-5" />
                <span>How sampling works</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">configureQueryAnalyzer</code> records queries into{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">config.sampledQueries</code>. Each sampled query looks like:
              </p>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre">{`{
  "cmdName": "find",
  "ns": "${namespace || 'db.collection'}",
  "cmd": {
    "filter": { "customerId": "c45f..." }
  }
}`}</pre>
              <p>These are what <code className="text-xs bg-muted px-1 py-0.5 rounded">analyzeShardKey</code> reads to evaluate how well a candidate key targets reads and writes.</p>
              <p><strong className="text-foreground">Storage:</strong> Sampled queries expire automatically via a TTL index on the <code className="text-xs bg-muted px-1 py-0.5 rounded">expireAt</code> field (~27 days by default). You can also clear them manually with the button above.</p>
              <p><strong className="text-foreground">Production note:</strong> Sampling adds minor overhead proportional to the rate. Use a low rate (1–5/sec) on production clusters.</p>
            </CardContent>
          </Card>
        </div>

        {/* Sampling Progress & Queries */}
        <div className="col-span-7 space-y-6">
          {/* Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Live Sampling Progress</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="text-4xl font-bold">
                  {formatNumber(status?.totalSamples || totalQueries)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Queries Sampled
                </div>
              </div>

              {/* Query Type Breakdown */}
              <div className="grid grid-cols-4 gap-4">
                {['find', 'aggregate', 'update', 'delete'].map((type) => (
                  <div
                    key={type}
                    className="text-center p-3 rounded-lg bg-muted"
                  >
                    <div className="text-lg font-semibold">
                      {queriesByType[type] || 0}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {type}
                    </div>
                  </div>
                ))}
              </div>

              {isActive && (
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sampling queries...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent Sampled Queries</span>
                {totalQueries > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    disabled={isClearing || isActive}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </CardTitle>
              {totalQueries > 0 && (
                <CardDescription>
                  {formatNumber(totalQueries)} queries stored in config.sampledQueries
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {queries.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-4 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <div>Type</div>
                    <div className="col-span-2">Filter</div>
                    <div>Expires</div>
                  </div>
                  {queries.slice(0, 10).map((query, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-4 gap-4 items-center py-2 text-sm"
                    >
                      <Badge variant="outline" className="w-fit">
                        {query.cmdName || 'find'}
                      </Badge>
                      <div className="col-span-2 font-mono text-xs truncate">
                        {JSON.stringify(query.cmd?.filter || query.cmd || {})}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {query.sampledAt ? new Date(query.sampledAt).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSearch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No queries sampled yet</p>
                  <p className="text-xs">Start sampling to see queries here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Next Steps */}
          {isActive && totalQueries === 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Sampling is active — now generate some traffic</p>
                    <p className="text-xs text-muted-foreground">
                      Sampling runs in the background. Use the workload simulator or your own app to generate queries — they'll be captured automatically.
                    </p>
                  </div>
                  <Button onClick={() => navigate('/workload')}>
                    Generate Workload
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {isActive && totalQueries > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Queries are being captured</p>
                    <p className="text-xs text-muted-foreground">
                      You can run analyzeShardKey now — sampling doesn't need to be stopped first. More sampled queries means more accurate read/write distribution metrics.
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => navigate('/workload')}>
                      More Traffic
                    </Button>
                    <Button onClick={() => navigate('/analysis')}>
                      Analyze Keys
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {!isActive && totalQueries > 0 && (
            <div className="flex justify-end">
              <Button onClick={() => navigate('/analysis')}>
                Analyze Shard Keys
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Raw Command/Response Modal */}
      <Dialog open={rawModalOpen} onOpenChange={setRawModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Raw configureQueryAnalyzer Command</DialogTitle>
            <DialogDescription>
              Last command sent and MongoDB response
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Command Sent</h4>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre overflow-auto max-h-[25vh]">
                {status?.lastCommand
                  ? JSON.stringify(status.lastCommand, null, 2)
                  : 'No command recorded yet.'}
              </pre>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Response Received</h4>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre overflow-auto max-h-[25vh]">
                {status?.lastResponse
                  ? JSON.stringify(status.lastResponse, null, 2)
                  : 'No response recorded yet.'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
