export type EvalDimension =
  | "summary_faithfulness"
  | "summary_coverage"
  | "tag_relevance"
  | "tag_specificity"
  | "answer_faithfulness"
  | "answer_relevance"
  | "scout_relevance";

export const DIMENSION_LABELS: Record<EvalDimension, string> = {
  summary_faithfulness: "Summary Faithfulness",
  summary_coverage: "Summary Coverage",
  tag_relevance: "Tag Relevance",
  tag_specificity: "Tag Specificity",
  answer_faithfulness: "Answer Faithfulness",
  answer_relevance: "Answer Relevance",
  scout_relevance: "Scout Relevance Accuracy",
};
