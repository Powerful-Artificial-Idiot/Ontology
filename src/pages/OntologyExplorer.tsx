import { ReactFlowProvider } from "reactflow";
import { OntologyExplorerPage, type OntologyExplorerPageProps } from "../features/ontology/OntologyExplorerPage";

export default function OntologyExplorer(props: OntologyExplorerPageProps) {
  return (
    <ReactFlowProvider>
      <OntologyExplorerPage {...props} />
    </ReactFlowProvider>
  );
}
