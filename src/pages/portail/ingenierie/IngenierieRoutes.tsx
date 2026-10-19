import { Routes, Route } from 'react-router-dom';
import PortailLayout from '../../../components/shell/PortailLayout';
import PageTransition from '../../../components/shell/PageTransition';
import IngenierieHome from './IngenierieHome';
import CentreImport from './CentreImport';
import IframeTool from './IframeTool';

export default function IngenierieRoutes() {
  return (
    <PortailLayout>
      <Routes>
        <Route
          path="/"
          element={
            <PageTransition>
              <IngenierieHome />
            </PageTransition>
          }
        />
        <Route
          path="/import"
          element={
            <PageTransition>
              <CentreImport />
            </PageTransition>
          }
        />
        <Route
          path="/mbf"
          element={
            <PageTransition>
              <IframeTool title="Analyse MBF" src="/legacy/departements/ingenierie/analyse-mbf.html" />
            </PageTransition>
          }
        />
        <Route
          path="/ram"
          element={
            <PageTransition>
              <IframeTool title="Analyse RAM" src="/legacy/departements/ingenierie/analyse-ram.html" />
            </PageTransition>
          }
        />
        <Route
          path="/rapport-journalier"
          element={
            <PageTransition>
              <IframeTool
                title="Rapport Journalier"
                src="/legacy/departements/ingenierie/analyse-rapport-journalier.html"
              />
            </PageTransition>
          }
        />
        <Route
          path="/performances"
          element={
            <PageTransition>
              <IframeTool title="Suivi des Performances" src="/legacy/departements/ingenierie/suivi-performances.html" />
            </PageTransition>
          }
        />
      </Routes>
    </PortailLayout>
  );
}
