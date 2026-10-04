import type { GenerateJsonRequest, LLMProvider, LLMUsage } from "@/lib/llm/provider";
import { LLMError } from "@/lib/llm/provider";

type Handler = (req: GenerateJsonRequest<unknown>) => unknown;

/** مزوّد وهمي للاختبارات بلا شبكة: يعيد ما يحدده المعالج لكل وسم (label). يتحقق من المخرجات بـ Zod كالحقيقي. */
export class MockProvider implements LLMProvider {
  calls: { label: string; input: GenerateJsonRequest<unknown>["input"] }[] = [];
  constructor(private readonly handlers: Record<string, Handler | Error>) {}

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<{ data: T; usage: LLMUsage }> {
    this.calls.push({ label: req.label, input: req.input });
    const h = this.handlers[req.label];
    if (!h) throw new LLMError(`لا معالج وهمي للوسم ${req.label}`, "unavailable");
    if (h instanceof Error) throw h;
    const data = req.schema.parse(h(req as GenerateJsonRequest<unknown>));
    return { data, usage: { input_tokens: 100, output_tokens: 20, thought_tokens: 0 } };
  }
}
