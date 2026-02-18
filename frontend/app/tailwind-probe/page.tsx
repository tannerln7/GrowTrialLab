import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function TailwindProbePage() {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <section className="mx-auto grid w-full max-w-3xl gap-4">
        <p className="text-sm font-semibold">Tailwind + shadcn-style scaffold probe</p>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Component Scaffold Check</CardTitle>
              <Badge variant="secondary">Phase S</Badge>
            </div>
            <CardDescription>
              Rendering foundational UI primitives and token-driven utilities.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              Token bridge active:
              {" "}
              <code>bg-background</code>
              ,{" "}
              <code>text-foreground</code>
              ,{" "}
              <code>border-border</code>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Badge>Ready</Badge>
            <Button variant="destructive" size="sm">
              Destructive
            </Button>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
