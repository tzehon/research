import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Info,
  TrendingUp,
  Target,
  Layers,
  Activity,
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
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useAnalysis } from '@/hooks/useAnalysis';
import {
  formatNumber,
  formatPercentage,
  getScoreColor,
  getScoreBgClass,
  generateChartColor,
  cn,
} from '@/lib/utils';

const CHART_COLORS = ['#00ED64', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReportPage() {
  const navigate = useNavigate();
  const { results, loadSavedResults } = useAnalysis();
  const [rawOutputModal, setRawOutputModal] = useState(null); // { key, rawCommand, rawOutput }

  // Load saved results on mount
  useEffect(() => {
    if (!results) {
      loadSavedResults();
    }
  }, [results, loadSavedResults]);

  if (!results || !results.results || results.results.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No analysis results yet</p>
            <Button variant="link" onClick={() => navigate('/analysis')}>
              Run Analysis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bestCandidate = results.results[0];
  const allResults = results.results;

  // Helper to shorten key names for chart labels
  const shortKeyName = (r) => {
    const fields = Object.keys(r.key);
    return fields.length > 1
      ? fields.join(' + ')
      : fields[0] + (Object.values(r.key)[0] === 'hashed' ? ' (hashed)' : '');
  };

  // Grouped bar chart: one group per metric, bars per candidate (top 3)
  const comparisonCandidates = allResults.slice(0, 3);
  const comparisonData = [
    'Cardinality', 'Frequency', 'Monotonicity', 'Read Targeting', 'Write Targeting',
  ].map((metric) => {
    const metricKey = metric.toLowerCase().replace(/ /g, '');
    const scoreKey = metric === 'Read Targeting' ? 'readTargeting'
      : metric === 'Write Targeting' ? 'writeTargeting'
      : metric.toLowerCase();
    const entry = { metric };
    comparisonCandidates.forEach((r, i) => {
      entry[`key${i}`] = r.score[scoreKey];
    });
    return entry;
  });

  // Prepare bar chart data with short labels
  const barData = allResults.map((r) => {
    return {
      name: shortKeyName(r),
      overall: r.score.overall,
      cardinality: r.score.cardinality,
      frequency: r.score.frequency,
      monotonicity: r.score.monotonicity,
      readTargeting: r.score.readTargeting,
      writeTargeting: r.score.writeTargeting,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analysis Report</h1>
          <p className="text-muted-foreground">
            Analyzed at {new Date(results.analyzedAt).toLocaleString()}
          </p>
        </div>
{/* Export removed — use per-row Raw buttons to view command/output */}
      </div>

      {/* Recommended Shard Key */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Trophy className="w-6 h-6 text-primary" />
            <CardTitle>Recommended Shard Key</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <code className="text-2xl font-bold">{bestCandidate.keyString}</code>
          </div>

          <div className="flex items-center justify-center space-x-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">
                {bestCandidate.score.overall}
              </div>
              <div className="text-sm text-muted-foreground">Overall Score</div>
            </div>
            <Progress value={bestCandidate.score.overall} className="w-48 h-3" />
          </div>

          {/* Score breakdown with weights */}
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'Cardinality', value: bestCandidate.score.cardinality, weight: 25 },
              { label: 'Frequency', value: bestCandidate.score.frequency, weight: 20 },
              { label: 'Monotonicity', value: bestCandidate.score.monotonicity, weight: 15 },
              { label: 'Read Targeting', value: bestCandidate.score.readTargeting, weight: 20 },
              { label: 'Write Targeting', value: bestCandidate.score.writeTargeting, weight: 20 },
            ].map((metric) => (
              <div key={metric.label} className="text-center p-3 rounded-lg bg-background">
                <div className={cn('text-xl font-bold', getScoreColor(metric.value))}>
                  {metric.value}%
                </div>
                <div className="text-xs text-muted-foreground">{metric.label}</div>
                <div className="text-xs text-muted-foreground/60">{metric.weight}% weight</div>
              </div>
            ))}
          </div>

          {/* Positive reasons */}
          {results.recommendations?.[0]?.reasons?.length > 0 && (
            <div className="space-y-2">
              {results.recommendations[0].reasons.map((reason, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Metric Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Metric Breakdown</CardTitle>
            <CardDescription>
              Top {comparisonCandidates.length} candidates compared per metric (0–100)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="metric" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                  labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                  itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                />
                {comparisonCandidates.map((r, i) => (
                  <Bar
                    key={i}
                    dataKey={`key${i}`}
                    name={shortKeyName(r)}
                    fill={CHART_COLORS[i]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Overall Scores</CardTitle>
            <CardDescription>Score comparison across all candidates</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                  labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                  itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                />
                <Bar dataKey="overall" fill="#00ED64" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Scores Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Shard Key</th>
                  <th className="text-center py-3 px-2">
                    <div>Cardinality</div>
                    <div className="text-xs font-normal text-muted-foreground/60">25%</div>
                  </th>
                  <th className="text-center py-3 px-2">
                    <div>Frequency</div>
                    <div className="text-xs font-normal text-muted-foreground/60">20%</div>
                  </th>
                  <th className="text-center py-3 px-2">
                    <div>Monotonic</div>
                    <div className="text-xs font-normal text-muted-foreground/60">15%</div>
                  </th>
                  <th className="text-center py-3 px-2">
                    <div>Read</div>
                    <div className="text-xs font-normal text-muted-foreground/60">20%</div>
                  </th>
                  <th className="text-center py-3 px-2">
                    <div>Write</div>
                    <div className="text-xs font-normal text-muted-foreground/60">20%</div>
                  </th>
                  <th className="text-center py-3 px-2">Overall</th>
                  <th className="text-center py-3 px-2">Grade</th>
                  <th className="text-center py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {allResults.map((r, idx) => (
                  <tr key={idx} className={cn('border-b', idx === 0 && 'bg-primary/5')}>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        {idx === 0 && <Trophy className="w-4 h-4 text-primary" />}
                        <code className="text-xs">{r.keyString}</code>
                      </div>
                    </td>
                    <td className={cn('text-center py-3 px-2', getScoreColor(r.score.cardinality))}>
                      {r.score.cardinality}
                    </td>
                    <td className={cn('text-center py-3 px-2', getScoreColor(r.score.frequency))}>
                      {r.score.frequency}
                    </td>
                    <td className="text-center py-3 px-2">
                      {r.keyCharacteristics?.monotonicity?.type === 'not monotonic' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : r.keyCharacteristics?.monotonicity?.type === 'monotonic' ? (
                        <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">?</span>
                      )}
                    </td>
                    <td className={cn('text-center py-3 px-2', getScoreColor(r.score.readTargeting))}>
                      {r.score.readTargeting}
                    </td>
                    <td className={cn('text-center py-3 px-2', getScoreColor(r.score.writeTargeting))}>
                      {r.score.writeTargeting}
                    </td>
                    <td className="text-center py-3 px-2 font-bold">{r.score.overall}</td>
                    <td className="text-center py-3 px-2">
                      <Badge className={cn('font-bold', getScoreBgClass(r.score.overall))}>
                        {r.score.grade}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRawOutputModal({ key: r.keyString, rawCommand: r.rawCommand, rawOutput: r.rawOutput })}
                        className="text-xs"
                      >
                        <Code className="w-3 h-3 mr-1" />
                        Raw
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {allResults.some((r) => r.warnings?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span>Warnings</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allResults
              .filter((r) => r.warnings?.length > 0)
              .map((r, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="font-mono text-sm font-medium">{r.keyString}</div>
                  {r.warnings.map((warning, wIdx) => (
                    <div
                      key={wIdx}
                      className={cn(
                        'flex items-start space-x-2 p-3 rounded-lg text-sm',
                        warning.severity === 'error'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-yellow-500/10 text-yellow-600'
                      )}
                    >
                      {warning.severity === 'error' ? (
                        <XCircle className="w-4 h-4 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 mt-0.5" />
                      )}
                      <span>{warning.message}</span>
                    </div>
                  ))}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Detailed Analysis for Best Candidate */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Analysis: {bestCandidate.keyString}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="characteristics">
            <TabsList>
              <TabsTrigger value="characteristics">Key Characteristics</TabsTrigger>
              <TabsTrigger value="reads">Read Distribution</TabsTrigger>
              <TabsTrigger value="writes">Write Distribution</TabsTrigger>
            </TabsList>

            <TabsContent value="characteristics" className="space-y-6 pt-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">
                      {formatNumber(bestCandidate.keyCharacteristics?.numDistinctValues || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Distinct Values</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Target className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">
                      {bestCandidate.keyCharacteristics?.isUnique ? 'Yes' : 'No'}
                    </div>
                    <div className="text-sm text-muted-foreground">Unique Index</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold capitalize">
                      {bestCandidate.keyCharacteristics?.monotonicity?.type || 'Unknown'}
                    </div>
                    <div className="text-sm text-muted-foreground">Monotonicity</div>
                  </CardContent>
                </Card>
              </div>

              {/* Most Common Values */}
              {bestCandidate.keyCharacteristics?.mostCommonValues?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Most Common Values</h4>
                  <div className="space-y-2">
                    {bestCandidate.keyCharacteristics.mostCommonValues.slice(0, 5).map((mcv, idx) => (
                      <div key={idx} className="flex items-center space-x-3">
                        <div className="w-32 text-sm font-mono truncate">{mcv.value}</div>
                        <div className="flex-1">
                          <Progress
                            value={
                              (mcv.frequency /
                                (bestCandidate.keyCharacteristics.numDocsTotal || 1)) *
                              100
                            }
                            className="h-2"
                          />
                        </div>
                        <div className="w-20 text-sm text-right">
                          {formatNumber(mcv.frequency)} docs
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="reads" className="space-y-6 pt-4">
              {bestCandidate.readDistribution ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Query Targeting</h4>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Single Shard</span>
                          <span>{formatPercentage(bestCandidate.readDistribution.percentageOfSingleShardReads)}</span>
                        </div>
                        <Progress value={bestCandidate.readDistribution.percentageOfSingleShardReads} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Multi Shard</span>
                          <span>{formatPercentage(bestCandidate.readDistribution.percentageOfMultiShardReads)}</span>
                        </div>
                        <Progress value={bestCandidate.readDistribution.percentageOfMultiShardReads} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Scatter-Gather</span>
                          <span>{formatPercentage(bestCandidate.readDistribution.percentageOfScatterGatherReads)}</span>
                        </div>
                        <Progress value={bestCandidate.readDistribution.percentageOfScatterGatherReads} className="h-2" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Sample Breakdown</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total samples</span>
                        <span>{formatNumber(bestCandidate.readDistribution.sampleSize?.total || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>find queries</span>
                        <span>{formatNumber(bestCandidate.readDistribution.sampleSize?.find || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>aggregate queries</span>
                        <span>{formatNumber(bestCandidate.readDistribution.sampleSize?.aggregate || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="w-8 h-8 mx-auto mb-2" />
                  <p>No read distribution data available</p>
                  <p className="text-xs">Run query sampling to gather read patterns</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="writes" className="space-y-6 pt-4">
              {bestCandidate.writeDistribution ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Write Targeting</h4>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Single Shard Writes</span>
                          <span>{formatPercentage(bestCandidate.writeDistribution.percentageOfSingleShardWrites)}</span>
                        </div>
                        <Progress value={bestCandidate.writeDistribution.percentageOfSingleShardWrites} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Scatter-Gather Writes</span>
                          <span>{formatPercentage(bestCandidate.writeDistribution.percentageOfScatterGatherWrites)}</span>
                        </div>
                        <Progress value={bestCandidate.writeDistribution.percentageOfScatterGatherWrites} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Shard Key Updates</span>
                          <span>{formatPercentage(bestCandidate.writeDistribution.percentageOfShardKeyUpdates)}</span>
                        </div>
                        <Progress value={bestCandidate.writeDistribution.percentageOfShardKeyUpdates} className="h-2" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Sample Breakdown</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total samples</span>
                        <span>{formatNumber(bestCandidate.writeDistribution.sampleSize?.total || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>update queries</span>
                        <span>{formatNumber(bestCandidate.writeDistribution.sampleSize?.update || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>delete queries</span>
                        <span>{formatNumber(bestCandidate.writeDistribution.sampleSize?.delete || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="w-8 h-8 mx-auto mb-2" />
                  <p>No write distribution data available</p>
                  <p className="text-xs">Run query sampling to gather write patterns</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={() => navigate('/analysis')}>
          New Analysis
        </Button>
        <Button onClick={() => navigate('/guide')}>
          Learn More
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Raw Command/Response Modal */}
      <Dialog open={!!rawOutputModal} onOpenChange={() => setRawOutputModal(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Raw analyzeShardKey Command &amp; Response</DialogTitle>
            <DialogDescription>
              Command and response for <code>{rawOutputModal?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Command Sent</h4>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre overflow-auto max-h-[25vh]">
                {rawOutputModal?.rawCommand
                  ? JSON.stringify(rawOutputModal.rawCommand, null, 2)
                  : 'No command recorded. Re-run the analysis to capture it.'}
              </pre>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Response Received</h4>
              <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre overflow-auto max-h-[25vh]">
                {rawOutputModal?.rawOutput
                  ? JSON.stringify(rawOutputModal.rawOutput, null, 2)
                  : 'No response available. Re-run the analysis to capture it.'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
