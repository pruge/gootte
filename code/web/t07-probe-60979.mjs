
      import { createFeaturesCompute } from "./backend/src/features-compute.ts";
      const c = createFeaturesCompute();
      const f = await c.run(["/var/folders/td/nwct8vw12d39cpg1cwzg6v7r0000gn/T/gootte-compute-FxKbtM/proj"]);
      console.log(JSON.stringify({ mode: c.mode(), count: f.length }));
      await c.close();
    