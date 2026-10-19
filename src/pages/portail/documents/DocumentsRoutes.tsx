import { Routes, Route } from 'react-router-dom';
import PortailLayout from '../../../components/shell/PortailLayout';
import PageTransition from '../../../components/shell/PageTransition';
import DocumentsHome from './DocumentsHome';
import IframeTool from '../ingenierie/IframeTool';

export default function DocumentsRoutes() {
  return (
    <PortailLayout>
      <Routes>
        <Route
          path="/"
          element={
            <PageTransition>
              <DocumentsHome />
            </PageTransition>
          }
        />
        <Route
          path="/validation"
          element={
            <PageTransition>
              <IframeTool
                title="Validation des rapports"
                src="/legacy/departements/ingenierie/validation-rapports.html"
              />
            </PageTransition>
          }
        />
        <Route
          path="/registre"
          element={
            <PageTransition>
              <IframeTool title="Registre des documents" src="/legacy/departements/maintenance/suivi-documents.html" />
            </PageTransition>
          }
        />
        <Route
          path="/modifications"
          element={
            <PageTransition>
              <IframeTool title="Demandes de modification" src="/legacy/suivi_modifications.html" />
            </PageTransition>
          }
        />
      </Routes>
    </PortailLayout>
  );
}
