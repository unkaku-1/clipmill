import { useEffect, useState } from "react";
import { Home } from "@/components/home/Home";
import { Editor } from "@/components/editor/Editor";
import { Toaster, toast } from "@/components/ui/feedback";
import { openProject } from "@/lib/projects";
import { useEditor } from "@/store/editor";

/** Hash routing keeps the open project across reloads: #/p/<id> */
function readHash(): string | null {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const project = useEditor((s) => s.project);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const id = readHash();
    if (!id) {
      setBooting(false);
      return;
    }
    void openProject(id)
      .then((ok) => {
        if (!ok) {
          history.replaceState(null, "", location.pathname);
          toast("找不到这个工程，可能已被删除", "error");
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const want = project ? `#/p/${project.id}` : "";
    if (location.hash !== want) history.replaceState(null, "", want || location.pathname);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {booting ? <div className="h-full bg-ink-1" /> : project ? <Editor key={project.id} /> : <Home />}
      <Toaster />
    </>
  );
}
