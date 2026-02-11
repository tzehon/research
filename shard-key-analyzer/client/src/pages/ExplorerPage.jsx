import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  FolderOpen,
  FileJson,
  ChevronRight,
  ArrowRight,
  Star,
  AlertTriangle,
  X,
  Plus,
  Loader2,
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
import { Separator } from '@/components/ui/separator';
import { explorerApi, sampleDataApi } from '@/lib/api';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';
import { formatBytes, formatNumber, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export default function ExplorerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectNamespace, selectedDatabase, selectedCollection } = useAtlasConnection();
  const [expandedDb, setExpandedDb] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null); // { progress, total }
  const pollRef = useRef(null);

  // Poll loading status and refresh queries when done
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch databases
  const { data: dbData, isLoading: isLoadingDbs } = useQuery({
    queryKey: ['databases'],
    queryFn: explorerApi.getDatabases,
  });

  // Fetch collections when database is expanded
  const { data: collData, isLoading: isLoadingColls } = useQuery({
    queryKey: ['collections', expandedDb],
    queryFn: () => explorerApi.getCollections(expandedDb),
    enabled: !!expandedDb,
  });

  // Fetch stats for selected collection
  const { data: statsData } = useQuery({
    queryKey: ['stats', selectedDatabase, selectedCollection],
    queryFn: () => explorerApi.getStats(selectedDatabase, selectedCollection),
    enabled: !!selectedDatabase && !!selectedCollection,
  });

  // Fetch schema for selected collection
  const { data: schemaData } = useQuery({
    queryKey: ['schema', selectedDatabase, selectedCollection],
    queryFn: () => explorerApi.getSchema(selectedDatabase, selectedCollection),
    enabled: !!selectedDatabase && !!selectedCollection,
  });

  // Fetch field analysis
  const { data: fieldData } = useQuery({
    queryKey: ['field-analysis', selectedDatabase, selectedCollection],
    queryFn: () => explorerApi.getFieldAnalysis(selectedDatabase, selectedCollection),
    enabled: !!selectedDatabase && !!selectedCollection,
  });

  // Fetch sample datasets
  const { data: datasetsData } = useQuery({
    queryKey: ['sample-datasets'],
    queryFn: sampleDataApi.getDatasets,
  });

  const handleSelectCollection = (database, collection) => {
    selectNamespace(database, collection);
  };

  const selectedCollectionHasData = statsData?.count > 0;

  const DATASET_DEFAULTS = {
    ecommerce: { database: 'sample_data', collection: 'orders' },
    social: { database: 'sample_data', collection: 'posts' },
  };

  const handleLoadSampleData = async (datasetId) => {
    // Use selected collection if it exists and is empty, otherwise use defaults
    const target = (selectedDatabase && selectedCollection && !selectedCollectionHasData)
      ? { database: selectedDatabase, collection: selectedCollection }
      : DATASET_DEFAULTS[datasetId];

    setIsLoadingData(true);
    try {
      await sampleDataApi.load({
        dataset: datasetId,
        database: target.database,
        collection: target.collection,
        count: 150000,
      });

      // Auto-select the target collection
      selectNamespace(target.database, target.collection);
      setExpandedDb(target.database);

      toast({
        title: 'Loading sample data',
        description: `Loading into ${target.database}.${target.collection}...`,
      });

      // Poll for loading completion and refresh queries when done
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await sampleDataApi.getStatus();
          setLoadingProgress({ progress: status.progress, total: status.total });
          if (!status.isLoading) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setIsLoadingData(false);
            setLoadingProgress(null);
            // Refresh all relevant queries
            queryClient.invalidateQueries({ queryKey: ['databases'] });
            queryClient.invalidateQueries({ queryKey: ['collections', target.database] });
            queryClient.invalidateQueries({ queryKey: ['stats', target.database, target.collection] });
            queryClient.invalidateQueries({ queryKey: ['schema', target.database, target.collection] });
            queryClient.invalidateQueries({ queryKey: ['field-analysis', target.database, target.collection] });
            toast({
              title: 'Sample data loaded',
              description: `Loaded ${formatNumber(status.progress)} documents into ${target.database}.${target.collection}`,
            });
          }
        } catch {
          // Ignore polling errors
        }
      }, 1000);
    } catch (err) {
      setIsLoadingData(false);
      toast({
        title: 'Failed to load sample data',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Collection Explorer</h1>
        <p className="text-muted-foreground">
          Browse your databases and select a collection to analyze
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Database/Collection Tree */}
        <div className="col-span-4">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Database className="w-5 h-5" />
                <span>Databases</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {isLoadingDbs ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded" />
                  ))}
                </div>
              ) : (
                dbData?.databases?.map((db) => (
                  <div key={db.name}>
                    <button
                      onClick={() => setExpandedDb(expandedDb === db.name ? null : db.name)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                        expandedDb === db.name && 'bg-accent'
                      )}
                    >
                      <div className="flex items-center space-x-2">
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        <span>{db.name}</span>
                      </div>
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 text-muted-foreground transition-transform',
                          expandedDb === db.name && 'rotate-90'
                        )}
                      />
                    </button>

                    {expandedDb === db.name && (
                      <div className="ml-4 mt-1 space-y-1">
                        {isLoadingColls ? (
                          <div className="animate-pulse space-y-1">
                            {[1, 2].map((i) => (
                              <div key={i} className="h-8 bg-muted rounded ml-2" />
                            ))}
                          </div>
                        ) : (
                          collData?.collections?.map((coll) => (
                            <button
                              key={coll.name}
                              onClick={() => handleSelectCollection(db.name, coll.name)}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors',
                                selectedDatabase === db.name &&
                                  selectedCollection === coll.name &&
                                  'bg-primary/10 text-primary'
                              )}
                            >
                              <div className="flex items-center space-x-2">
                                <FileJson className="w-4 h-4 text-muted-foreground" />
                                <span>{coll.name}</span>
                              </div>
                              {coll.isSharded && (
                                <Badge variant="secondary" className="text-xs">
                                  Sharded
                                </Badge>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>

            <Separator />

            {/* Sample Data Section */}
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="text-sm font-medium">Load Sample Data</div>
                {isLoadingData && loadingProgress ? (
                  <div className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center space-x-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading data...</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${loadingProgress.total ? (loadingProgress.progress / loadingProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(loadingProgress.progress)} / {formatNumber(loadingProgress.total)} documents
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {datasetsData?.datasets?.slice(0, 2).map((dataset) => (
                      <button
                        key={dataset.id}
                        onClick={() => handleLoadSampleData(dataset.id)}
                        disabled={isLoadingData}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div>
                          <div className="font-medium">{dataset.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatNumber(dataset.defaultCount)} documents
                          </div>
                        </div>
                        <Plus className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collection Details */}
        <div className="col-span-8 space-y-6">
          {isLoadingData ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-lg font-medium mb-2">Loading sample data...</p>
                {loadingProgress && loadingProgress.total > 0 && (
                  <div className="max-w-xs mx-auto space-y-2">
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="bg-primary h-3 rounded-full transition-all duration-500"
                        style={{ width: `${(loadingProgress.progress / loadingProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(loadingProgress.progress)} / {formatNumber(loadingProgress.total)} documents
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  This may take a moment. Stats will appear when loading completes.
                </p>
              </CardContent>
            </Card>
          ) : selectedDatabase && selectedCollection ? (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {formatNumber(statsData?.count || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Documents</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {formatBytes(statsData?.avgObjSize || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Size</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center space-x-2">
                      <div className="text-2xl font-bold">
                        {statsData?.isSharded ? 'Sharded' : 'Not Sharded'}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {statsData?.isSharded
                        ? `Key: ${JSON.stringify(statsData.shardKey)}`
                        : 'Configure sharding to distribute'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Schema Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Schema Preview</CardTitle>
                  <CardDescription>
                    Sampled from {schemaData?.sampleCount || 0} documents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    <pre>
                      {JSON.stringify(schemaData?.sampleDocument || {}, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Assessment</CardTitle>
                  <CardDescription>
                    Preliminary shard key candidates based on schema sampling. Run the Analysis Wizard for a full evaluation using analyzeShardKey.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fieldData?.candidates?.slice(0, 6).map((field) => (
                      <div
                        key={field.label}
                        className="flex items-start justify-between p-3 rounded-lg border"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm font-medium">{field.label}</span>
                            <Badge variant="outline" className="text-xs">{field.type}</Badge>
                            {field.hasIndex && (
                              <Badge variant="success" className="text-xs">Indexed</Badge>
                            )}
                          </div>
                          {field.reasons?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {field.reasons.map((reason, i) => (
                                <span key={i} className="text-xs text-muted-foreground">
                                  {i > 0 && ' · '}{reason}
                                </span>
                              ))}
                            </div>
                          )}
                          {field.warnings?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {field.warnings.map((warning, i) => (
                                <span key={i} className="text-xs text-yellow-500">
                                  {i > 0 && ' · '}{warning}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="ml-3 shrink-0">
                          {field.rating === 'recommended' ? (
                            <Badge className="bg-green-500/15 text-green-500 border-green-500/20">
                              <Star className="w-3 h-3 mr-1 fill-green-500" />
                              Recommended
                            </Badge>
                          ) : field.rating === 'possible' ? (
                            <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Possible
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/15 text-red-500 border-red-500/20">
                              <X className="w-3 h-3 mr-1" />
                              Avoid
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end">
                <Button onClick={() => navigate('/sampling')}>
                  Next: Configure Sampling
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a database and collection to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
