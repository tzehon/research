import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Play,
  Square,
  ShoppingCart,
  MessageSquare,
  Settings,
  Clock,
  Gauge,
  Activity,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertTriangle,
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
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { workloadApi } from '@/lib/api';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { useWorkloadSocket } from '@/hooks/useSocket';
import { formatNumber, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

const PROFILE_ICONS = {
  ecommerce: ShoppingCart,
  social: MessageSquare,
  custom: Settings,
};

export default function WorkloadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedDatabase, selectedCollection, namespace } = useAtlasConnection();

  const [selectedProfile, setSelectedProfile] = useState('ecommerce');
  const [durationMinutes, setDurationMinutes] = useState(2);
  const [qps, setQps] = useState(15);
  const [enabledPatterns, setEnabledPatterns] = useState({});

  // Fetch profiles
  const { data: profilesData } = useQuery({
    queryKey: ['workload-profiles'],
    queryFn: workloadApi.getProfiles,
  });

  // Fetch status
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['workload-status'],
    queryFn: workloadApi.getStatus,
    refetchInterval: (data) => (data?.isRunning ? 1000 : false),
  });

  // Socket for real-time updates
  const { progress, stats, isComplete, reset } = useWorkloadSocket(
    selectedDatabase,
    selectedCollection
  );

  // Start mutation
  const startMutation = useMutation({
    mutationFn: workloadApi.start,
    onSuccess: () => {
      toast({ title: 'Workload started' });
      refetchStatus();
    },
    onError: (err) => {
      toast({
        title: 'Failed to start workload',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Stop mutation
  const stopMutation = useMutation({
    mutationFn: workloadApi.stop,
    onSuccess: () => {
      toast({ title: 'Workload stopped' });
      refetchStatus();
    },
  });

  const profiles = profilesData?.profiles || [];
  const currentProfile = profiles.find((p) => p.id === selectedProfile);
  const isRunning = statusData?.isRunning || false;

  // Initialize enabled patterns when profile changes
  useEffect(() => {
    if (currentProfile) {
      const initial = {};
      currentProfile.patterns.forEach((p) => {
        initial[p.name] = true;
      });
      setEnabledPatterns(initial);
    }
  }, [currentProfile]);

  const handleStart = () => {
    startMutation.mutate({
      database: selectedDatabase,
      collection: selectedCollection,
      profile: selectedProfile,
      durationSeconds: durationMinutes * 60,
      queriesPerSecond: qps,
    });
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  const togglePattern = (name) => {
    setEnabledPatterns((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  if (!namespace) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardContent className="py-12 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Select a collection first</p>
            <Button variant="link" onClick={() => navigate('/explorer')}>
              Go to Explorer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStats = stats || statusData?.stats;
  const currentProgress = progress || statusData;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workload Simulator</h1>
        <p className="text-muted-foreground">
          Generate realistic query patterns to test shard key effectiveness
        </p>
      </div>

      <div className="flex items-start space-x-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">Not for production collections.</strong> This simulator runs real reads and writes against your collection. Use it with sample data or a test environment. If analyzing a production collection, use your real application traffic instead.
        </span>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Configuration */}
        <div className="col-span-5 space-y-6">
          {/* Profile Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Workload Profile</CardTitle>
              <CardDescription>
                Select a pre-configured workload pattern
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {profiles.map((profile) => {
                  const Icon = PROFILE_ICONS[profile.id] || Settings;
                  return (
                    <button
                      key={profile.id}
                      onClick={() => setSelectedProfile(profile.id)}
                      disabled={isRunning}
                      className={cn(
                        'flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-colors',
                        selectedProfile === profile.id
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted hover:bg-accent',
                        isRunning && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Icon className="w-6 h-6 mb-2" />
                      <span className="text-sm font-medium">{profile.name}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <Label>Duration</Label>
                  <span className="font-mono">{durationMinutes} {durationMinutes === 1 ? 'minute' : 'minutes'}</span>
                </div>
                <Slider
                  value={[durationMinutes]}
                  onValueChange={(v) => setDurationMinutes(v[0])}
                  min={1}
                  max={10}
                  step={1}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <Label>Target QPS</Label>
                  <span className="font-mono">{qps} queries/sec</span>
                </div>
                <Slider
                  value={[qps]}
                  onValueChange={(v) => setQps(v[0])}
                  min={5}
                  max={50}
                  step={5}
                  disabled={isRunning}
                />
                <div className="text-xs text-muted-foreground">
                  Best-effort — actual rate depends on query latency
                </div>
              </div>

              <div className="pt-2 text-sm text-muted-foreground">
                Runs for {durationMinutes} {durationMinutes === 1 ? 'minute' : 'minutes'}, aiming for ~{formatNumber(durationMinutes * 60 * qps)} queries
              </div>
            </CardContent>
          </Card>

          {/* Query Patterns */}
          {currentProfile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Query Patterns</CardTitle>
                <CardDescription>{currentProfile.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentProfile.patterns.map((pattern) => (
                  <div
                    key={pattern.name}
                    className="flex items-start space-x-3 p-3 rounded-lg bg-muted"
                  >
                    <Checkbox
                      id={pattern.name}
                      checked={enabledPatterns[pattern.name]}
                      onCheckedChange={() => togglePattern(pattern.name)}
                      disabled={isRunning}
                    />
                    <div className="flex-1">
                      <Label htmlFor={pattern.name} className="cursor-pointer">
                        <div className="flex items-center justify-between">
                          <span>{pattern.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {pattern.weight}%
                          </Badge>
                        </div>
                      </Label>
                      <div className="text-xs text-muted-foreground mt-1">
                        {pattern.operation} • {pattern.type}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Progress & Stats */}
        <div className="col-span-7 space-y-6">
          {/* Control */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex space-x-3">
                {isRunning ? (
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="flex-1"
                    disabled={stopMutation.isPending}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Workload
                  </Button>
                ) : (
                  <Button
                    onClick={handleStart}
                    className="flex-1"
                    disabled={startMutation.isPending}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Workload Simulation
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Progress</span>
                {isRunning && (
                  <Badge variant="success" className="animate-pulse">
                    Running
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={currentProgress?.progress || 0} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {formatNumber(currentProgress?.queriesExecuted || 0)} queries
                  {currentProgress?.actualQps ? ` · ${currentProgress.actualQps} QPS actual` : ''}
                </span>
                <span>
                  {isComplete
                    ? 'Complete'
                    : currentProgress?.remaining
                    ? `${currentProgress.remaining}s remaining`
                    : 'Not started'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                  <div className="text-2xl font-bold">
                    {formatNumber(currentStats?.successfulQueries || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <XCircle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                  <div className="text-2xl font-bold">
                    {formatNumber(currentStats?.failedQueries || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <Gauge className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                  <div className="text-2xl font-bold">
                    {currentStats?.latencies?.length
                      ? Math.round(
                          currentStats.latencies.reduce((a, b) => a + b, 0) /
                            currentStats.latencies.length
                        )
                      : 0}
                    ms
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Latency</div>
                </div>
              </div>

              {/* Operation breakdown */}
              {currentStats?.byOperation && Object.keys(currentStats.byOperation).length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-medium mb-3">By Operation</div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(currentStats.byOperation).map(([op, count]) => (
                      <div key={op} className="text-center p-2 rounded bg-muted">
                        <div className="font-semibold">{formatNumber(count)}</div>
                        <div className="text-xs text-muted-foreground capitalize">{op}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actual Results */}
          {(isComplete || (currentStats?.totalQueries > 0 && !isRunning)) && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-lg">Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold">{formatNumber(currentStats?.totalQueries || 0)}</div>
                    <div className="text-xs text-muted-foreground">Total Queries</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold">{currentStats?.actualQps ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">Actual QPS</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold">{currentStats?.actualDurationSeconds ?? '—'}s</div>
                    <div className="text-xs text-muted-foreground">Actual Duration</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          {(isComplete || (currentStats?.totalQueries > 0 && !isRunning)) && (
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => navigate('/sampling')}>
                Back to Sampling
              </Button>
              <Button onClick={() => navigate('/analysis')}>
                Next: Analyze Shard Keys
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
