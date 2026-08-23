import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type ModulePlaceholderProps = {
  title: string;
  subtitle: string;
  todos: string[];
};

export function ModulePlaceholder({ title, subtitle, todos }: ModulePlaceholderProps) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Implementation checklist</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
          {todos.map((todo) => (
            <li key={todo}>{todo}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
