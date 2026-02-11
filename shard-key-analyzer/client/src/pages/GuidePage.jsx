import {
  BookOpen,
  Layers,
  BarChart3,
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Lightbulb,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

export default function GuidePage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <BookOpen className="w-12 h-12 mx-auto text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Shard Key Guide</h1>
        <p className="text-lg text-muted-foreground">
          Understanding how to choose the optimal shard key for your MongoDB cluster
        </p>
      </div>

      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle>What is a Shard Key?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            A shard key is a field or combination of fields that MongoDB uses to distribute
            documents across shards in a sharded cluster. The choice of shard key directly
            impacts the performance and scalability of your cluster.
          </p>
          <p>
            Once a collection is sharded, the shard key cannot be changed. This makes choosing
            the right shard key one of the most critical decisions in designing a sharded cluster.
          </p>
          <div className="flex items-start space-x-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Lightbulb className="w-5 h-5 text-primary mt-0.5" />
            <p className="text-sm text-foreground">
              Use the <strong>analyzeShardKey</strong> command (MongoDB 7.0+) to evaluate
              candidate shard keys before making your decision.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Key Characteristics */}
      <Card>
        <CardHeader>
          <CardTitle>Key Characteristics to Evaluate</CardTitle>
          <CardDescription>
            Four main factors determine the quality of a shard key
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="cardinality">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="cardinality">Cardinality</TabsTrigger>
              <TabsTrigger value="frequency">Frequency</TabsTrigger>
              <TabsTrigger value="monotonicity">Monotonicity</TabsTrigger>
              <TabsTrigger value="targeting">Targeting</TabsTrigger>
            </TabsList>

            <TabsContent value="cardinality" className="space-y-4 pt-4">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <Layers className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Cardinality</h3>
                  <p className="text-muted-foreground">
                    The number of distinct shard key values determines the maximum number of
                    chunks your cluster can have.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-14">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />
                  <div>
                    <span className="font-medium">Good:</span>
                    <span className="text-muted-foreground ml-2">
                      Fields with many unique values (UUIDs, user IDs, email addresses)
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-1" />
                  <div>
                    <span className="font-medium">Bad:</span>
                    <span className="text-muted-foreground ml-2">
                      Fields with few values (status, region, boolean fields)
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm">
                  <strong>Example:</strong> A "region" field with only 4 values (NA, EU, APAC, LATAM)
                  would limit your cluster to 4 chunks maximum, severely constraining horizontal scaling.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="frequency" className="space-y-4 pt-4">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <BarChart3 className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Frequency Distribution</h3>
                  <p className="text-muted-foreground">
                    How evenly the shard key values are distributed across your documents.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-14">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />
                  <div>
                    <span className="font-medium">Good:</span>
                    <span className="text-muted-foreground ml-2">
                      Evenly distributed values where no single value dominates
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-1" />
                  <div>
                    <span className="font-medium">Bad:</span>
                    <span className="text-muted-foreground ml-2">
                      One value appears in 50%+ of documents (hotspot)
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm">
                  <strong>Example:</strong> If 80% of orders have status="delivered", using status as
                  a shard key would create a massive hotspot on one chunk, causing performance issues.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="monotonicity" className="space-y-4 pt-4">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-lg bg-yellow-500/10">
                  <TrendingUp className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Monotonicity</h3>
                  <p className="text-muted-foreground">
                    Whether the shard key values increase or decrease over time.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-14">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />
                  <div>
                    <span className="font-medium">Good:</span>
                    <span className="text-muted-foreground ml-2">
                      Random values (UUIDs, hashed keys, distributed IDs)
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-1" />
                  <div>
                    <span className="font-medium">Bad:</span>
                    <span className="text-muted-foreground ml-2">
                      Timestamps, auto-incrementing IDs, ObjectIds
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm">
                  <strong>Example:</strong> Using createdAt as a shard key routes all new inserts to
                  the shard holding the maximum time range, creating a write hotspot.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="targeting" className="space-y-4 pt-4">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Target className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Query Targeting</h3>
                  <p className="text-muted-foreground">
                    Whether your queries can target specific shards or must scatter to all shards.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-14">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />
                  <div>
                    <span className="font-medium">Good:</span>
                    <span className="text-muted-foreground ml-2">
                      Shard key fields that appear in your most common query filters
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-1" />
                  <div>
                    <span className="font-medium">Bad:</span>
                    <span className="text-muted-foreground ml-2">
                      Shard key fields rarely used in queries (causes scatter-gather)
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm">
                  <strong>Example:</strong> If 90% of queries filter by customerId, using customerId
                  as the shard key enables targeted queries. Using orderId might cause scatter-gather
                  if queries rarely filter by orderId.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Common Patterns */}
      <Card>
        <CardHeader>
          <CardTitle>Common Sharding Patterns</CardTitle>
          <CardDescription>
            Recommended shard key strategies for different use cases
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-4 p-4 rounded-lg border">
              <Badge className="bg-emerald-500">E-commerce</Badge>
              <div>
                <h4 className="font-medium">Order Management</h4>
                <p className="text-sm text-muted-foreground">
                  <code className="bg-muted px-1">{"{ customerId: 1 }"}</code> or
                  <code className="bg-muted px-1 ml-1">{"{ customerId: 1, createdAt: 1 }"}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Most queries filter by customer. Compound key enables date range queries within customer.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 rounded-lg border">
              <Badge className="bg-blue-500">Multi-tenant SaaS</Badge>
              <div>
                <h4 className="font-medium">Tenant Data</h4>
                <p className="text-sm text-muted-foreground">
                  <code className="bg-muted px-1">{"{ tenantId: 1 }"}</code> or
                  <code className="bg-muted px-1 ml-1">{"{ tenantId: 1, entityId: 1 }"}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  All queries naturally filter by tenant. Zone sharding can isolate tenant data geographically.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 rounded-lg border">
              <Badge className="bg-yellow-500">IoT / Time-Series</Badge>
              <div>
                <h4 className="font-medium">Sensor Data</h4>
                <p className="text-sm text-muted-foreground">
                  <code className="bg-muted px-1">{"{ deviceId: 1, timestamp: 1 }"}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avoid timestamp alone (monotonic). Device ID as prefix distributes writes.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 rounded-lg border">
              <Badge className="bg-purple-500">Social Media</Badge>
              <div>
                <h4 className="font-medium">User Content</h4>
                <p className="text-sm text-muted-foreground">
                  <code className="bg-muted px-1">{"{ userId: 1 }"}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  User timeline queries are the most common. All user data co-located on same shard.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <span>Common Mistakes to Avoid</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-500">Using ObjectId or timestamp alone</h4>
              <p className="text-sm text-muted-foreground">
                These are monotonically increasing and will route all inserts to one shard.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-500">Low cardinality fields</h4>
              <p className="text-sm text-muted-foreground">
                Fields like status, type, or region with few values severely limit scaling.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-500">Fields not in query filters</h4>
              <p className="text-sm text-muted-foreground">
                Choosing a shard key not used in queries causes expensive scatter-gather operations.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-500">Frequently updated shard key fields</h4>
              <p className="text-sm text-muted-foreground">
                Updating a shard key field requires moving the document between shards.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <a
            href="https://www.mongodb.com/docs/manual/core/sharding-shard-key/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
          >
            <span>MongoDB Shard Key Documentation</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href="https://www.mongodb.com/docs/manual/reference/command/analyzeShardKey/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
          >
            <span>analyzeShardKey Command Reference</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href="https://www.mongodb.com/docs/manual/core/zone-sharding/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
          >
            <span>Zone Sharding for Data Locality</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
