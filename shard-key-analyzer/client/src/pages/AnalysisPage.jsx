import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Trash2,
  Play,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Database,
  Info,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { explorerApi } from '@/lib/api';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { useAnalysis } from '@/hooks/useAnalysis';
import { cn, formatNumber } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export default function AnalysisPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedDatabase, selectedCollection, namespace } = useAtlasConnection();

  const [candidates, setCandidates] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('1');

  const { analyze, results, isAnalyzing, progress, error, clearResults } = useAnalysis();

  // Fetch field analysis for suggestions
  const { data: fieldData } = useQuery({
    queryKey: ['field-analysis', selectedDatabase, selectedCollection],
    queryFn: () => explorerApi.getFieldAnalysis(selectedDatabase, selectedCollection),
    enabled: !!selectedDatabase && !!selectedCollection,
  });

  const suggestedCandidates = fieldData?.candidates?.slice(0, 6) || [];

  const addCandidate = (key, label) => {
    const keyStr = typeof key === 'string' ? key : JSON.stringify(key);
    if (candidates.some((c) => JSON.stringify(c.key) === keyStr)) {
      toast({ title: 'Candidate already added', variant: 'destructive' });
      return;
    }
    setCandidates([
      ...candidates,
      { key: typeof key === 'string' ? JSON.parse(key) : key, label: label || keyStr },
    ]);
  };

  const addCustomCandidate = () => {
    if (!newFieldName) return;

    const key = { [newFieldName]: newFieldType === 'hashed' ? 'hashed' : parseInt(newFieldType) };
    addCandidate(key, `${newFieldName}: ${newFieldType}`);
    setNewFieldName('');
    setNewFieldType('1');
  };

  const removeCandidate = (index) => {
    setCandidates(candidates.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (candidates.length === 0) {
      toast({ title: 'Add at least one candidate', variant: 'destructive' });
      return;
    }

    try {
      const data = await analyze(selectedDatabase, selectedCollection, candidates);
      if (data.errors?.length > 0 && data.results?.length === 0) {
        toast({
          title: 'Analysis failed for all candidates',
          description: data.errors[0]?.error || 'Unknown error',
          variant: 'destructive',
        });
      } else if (data.errors?.length > 0) {
        toast({
          title: 'Some candidates failed',
          description: `${data.results.length} succeeded, ${data.errors.length} failed`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Analysis complete' });
      }
    } catch (err) {
      toast({ title: 'Analysis failed', description: err.message, variant: 'destructive' });
    }
  };

  const viewReport = () => {
    navigate('/report');
  };

  if (!namespace) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
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
        <h1 className="text-2xl font-bold tracking-tight">Shard Key Analysis</h1>
        <p className="text-muted-foreground">
          Select and analyze candidate shard keys for {namespace}
        </p>
      </div>

      {/* How it works */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <strong className="text-foreground">How this works:</strong> You pick candidate shard keys below, then this page runs MongoDB's{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">analyzeShardKey</code> command for each one.
              </p>
              <p>
                It reads from <strong className="text-foreground">two data sources</strong>:{' '}
                <strong className="text-foreground">key characteristics</strong> (cardinality, frequency, monotonicity) come from reading documents in your collection,
                while <strong className="text-foreground">read/write distribution</strong> comes from the sampled queries captured by{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">configureQueryAnalyzer</code>.
                The first tells you about your data, the second tells you about your queries.
              </p>
              <p>
                The analysis is read-only — you can re-run it as many times as you like with different candidates. Sampling can stay active in the background.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        {/* Candidate Selection */}
        <div className="col-span-7 space-y-6">
          {/* Selected Candidates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Candidate Shard Keys</span>
                <Badge variant="outline">{candidates.length} selected</Badge>
              </CardTitle>
              <CardDescription>
                Add shard key candidates to analyze and compare
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {candidates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No candidates selected</p>
                  <p className="text-xs">Add from suggestions or create custom</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidates.map((candidate, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted"
                    >
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <code className="text-sm">
                          {JSON.stringify(candidate.key)}
                        </code>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCandidate(idx)}
                        disabled={isAnalyzing}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex items-end space-x-3">
                  <div className="flex-1">
                    <Label className="text-xs">Field Name</Label>
                    <Input
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="e.g. userId, customerId, region"
                      disabled={isAnalyzing}
                      onKeyDown={(e) => e.key === 'Enter' && newFieldName && addCustomCandidate()}
                    />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">Type</Label>
                    <Select value={newFieldType} onValueChange={setNewFieldType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Ascending (1)</SelectItem>
                        <SelectItem value="-1">Descending (-1)</SelectItem>
                        <SelectItem value="hashed">Hashed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={addCustomCandidate}
                    disabled={!newFieldName || isAnalyzing}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a top-level field name from your documents exactly as it appears (case-sensitive).
                  For nested fields use dot notation, e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">address.country</code>.
                  Each add creates a single-field candidate. For compound keys, add each field separately or use the suggestions above.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Suggested Candidates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Suggested Candidates</CardTitle>
              <CardDescription>
                Based on schema analysis of your collection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {suggestedCandidates.map((field, idx) => (
                  <button
                    key={idx}
                    onClick={() => addCandidate(field.key, field.label)}
                    disabled={
                      isAnalyzing ||
                      candidates.some(
                        (c) => JSON.stringify(c.key) === JSON.stringify(field.key)
                      )
                    }
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border text-sm text-left transition-colors',
                      candidates.some(
                        (c) => JSON.stringify(c.key) === JSON.stringify(field.key)
                      )
                        ? 'bg-primary/5 border-primary'
                        : 'hover:bg-accent'
                    )}
                  >
                    <div>
                      <div className="font-mono text-xs">
                        {JSON.stringify(field.key)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Score: {field.score}
                      </div>
                    </div>
                    {candidates.some(
                      (c) => JSON.stringify(c.key) === JSON.stringify(field.key)
                    ) ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Options & Run */}
        <div className="col-span-5 space-y-6">
          {/* What the analysis calculates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What Gets Analyzed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted">
                <Database className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-sm font-medium">Key Characteristics</div>
                  <div className="text-xs text-muted-foreground">Cardinality, frequency, monotonicity — reads from your collection</div>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted">
                <Search className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-sm font-medium">Read/Write Distribution</div>
                  <div className="text-xs text-muted-foreground">Query targeting — reads from sampled queries captured by configureQueryAnalyzer</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Run Analysis */}
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={handleAnalyze}
                className="w-full"
                disabled={candidates.length === 0 || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analyze {candidates.length} Candidates
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Progress */}
          {isAnalyzing && progress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Analysis Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidates.map((candidate, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <code className="text-xs">{JSON.stringify(candidate.key)}</code>
                      {idx < progress.current ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : idx === progress.current ? (
                        <Clock className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <Progress
                      value={
                        idx < progress.current
                          ? 100
                          : idx === progress.current
                          ? 50
                          : 0
                      }
                      className="h-1"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Results Preview */}
          {results && !isAnalyzing && results.results?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span>Analysis Complete</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Best candidate:</span>{' '}
                  <code className="font-medium">
                    {results.results[0].keyString}
                  </code>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Score:</span>{' '}
                  <span className="font-bold text-primary">
                    {results.results[0].score?.overall || 0}/100
                  </span>
                </div>
                <Button onClick={viewReport} className="w-full">
                  Next: View Full Report
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {results && !isAnalyzing && results.errors?.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <span>{results.results?.length > 0 ? 'Some Candidates Failed' : 'Analysis Failed'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {results.errors.map((err, idx) => (
                  <div key={idx} className="text-sm p-3 rounded-lg bg-destructive/10">
                    <code className="text-xs">{JSON.stringify(err.key)}</code>
                    <p className="text-destructive mt-1">{err.error}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5" />
                <p>
                  Analysis uses MongoDB's analyzeShardKey command to evaluate each
                  candidate against cardinality, frequency, monotonicity, and query
                  targeting metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
