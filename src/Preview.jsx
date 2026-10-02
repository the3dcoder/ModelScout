import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { AMFLoader } from "three/addons/loaders/AMFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box, RotateCcw, LoaderCircle } from "lucide-react";

function convertedModel(data, material) {
  const meshes = data.meshes.map((m) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(m.positions, 3),
    );
    if (m.normals)
      geometry.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
    if (m.indices?.length)
      geometry.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return new THREE.Mesh(geometry, material);
  });
  if (data.kind === "occt") {
    const group = new THREE.Group();
    meshes.forEach((m) => group.add(m));
    return group;
  }
  const node = (n) => {
    const group = new THREE.Group();
    if (n.transformation)
      group.applyMatrix4(
        new THREE.Matrix4().fromArray(n.transformation).transpose(),
      );
    for (const id of n.meshes || []) group.add(meshes[id].clone());
    for (const child of n.children || []) group.add(node(child));
    return group;
  };
  return node(data.root);
}

export const Preview = forwardRef(function Preview(
  { file, onFacts, thumbnail = false, onReady, onError },
  ref,
) {
  const host = useRef(null),
    sceneRef = useRef(null),
    callbackRef = useRef(onFacts);
  const [status, setStatus] = useState(""),
    [loaded, setLoaded] = useState(false),
    [readyId, setReadyId] = useState(null);
  callbackRef.current = onFacts;
  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        if (!sceneRef.current || !loaded)
          throw new Error("Wait for a supported model preview first.");
        const { renderer, scene, camera } = sceneRef.current;
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
    }),
    [loaded],
  );
  useEffect(() => {
    let disposed = false,
      renderer,
      controls,
      observer,
      scene,
      model,
      frame;
    setLoaded(false);
    setReadyId(null);
    setStatus(
      file?.preview
        ? "Loading model…"
        : "Preview not available for this format. The file is still searchable and can be copied.",
    );
    if (!file?.preview) return;
    const cleanup = () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      if (scene)
        scene.traverse((o) => {
          o.geometry?.dispose();
          for (const m of Array.isArray(o.material)
            ? o.material
            : o.material
              ? [o.material]
              : []) {
            for (const value of Object.values(m))
              if (value?.isTexture) value.dispose();
            m.dispose();
          }
        });
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      sceneRef.current = null;
    };
    (async () => {
      const payload = file.editedToken
        ? await window.scout.readEdit(file.editedToken)
        : await window.scout.read(file.id);
      if (disposed) return;
      const buffer = payload.buffer.buffer.slice(
        payload.buffer.byteOffset,
        payload.buffer.byteOffset + payload.buffer.byteLength,
      );
      const text = () => new TextDecoder().decode(buffer);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith("data:") || url.startsWith("blob:")) return url;
        throw new Error(
          "This model needs external assets. Use a self-contained GLB or open its source project.",
        );
      });
      const material = new THREE.MeshStandardMaterial({
        color: 0x87afe8,
        roughness: 0.68,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      if (file.ext === "stl")
        model = new THREE.Mesh(new STLLoader(manager).parse(buffer), material);
      else if (file.ext === "ply")
        model = new THREE.Mesh(new PLYLoader(manager).parse(buffer), material);
      else if (file.ext === "obj") model = new OBJLoader(manager).parse(text());
      else if (file.ext === "3mf")
        model = new ThreeMFLoader(manager).parse(buffer);
      else if (file.ext === "amf") model = new AMFLoader(manager).parse(buffer);
      else if (file.ext === "fbx") {
        try {
          model = new FBXLoader(manager).parse(buffer, "");
        } catch {
          setStatus("Loading model…");
          model = convertedModel(await window.scout.convert(file.id), material);
        }
      } else if (["step", "stp", "iges", "igs"].includes(file.ext))
        model = convertedModel(await window.scout.convert(file.id), material);
      else if (file.ext === "dae")
        model = new ColladaLoader(manager).parse(text(), "").scene;
      else if (file.ext === "3ds")
        model = new TDSLoader(manager).parse(buffer, "");
      else model = (await new GLTFLoader(manager).parseAsync(buffer, "")).scene;
      if (disposed) {
        model.traverse((o) => o.geometry?.dispose());
        return;
      }
      let triangles = 0,
        meshes = 0;
      const embeddedNames = [];
      model.traverse((o) => {
        if (
          o.name &&
          embeddedNames.length < 12 &&
          !embeddedNames.includes(o.name)
        )
          embeddedNames.push(o.name.slice(0, 100));
      });
      model.traverse((o) => {
        if (o.isMesh) {
          meshes++;
          triangles +=
            (o.geometry.index?.count ||
              o.geometry.attributes.position?.count ||
              0) / 3;
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          if (["obj", "ply", "stl"].includes(file.ext)) o.material = material;
        }
      });
      if (!meshes)
        throw new Error(
          "No mesh geometry found in this file. It may contain other data.",
        );
      const bounds = new THREE.Box3().setFromObject(model);
      if (bounds.isEmpty())
        throw new Error("The model has no visible geometry.");
      const dimensions = bounds.getSize(new THREE.Vector3());
      if (![dimensions.x, dimensions.y, dimensions.z].every(Number.isFinite))
        throw new Error("Model contains invalid coordinates.");
      const extent = Math.max(dimensions.x, dimensions.y, dimensions.z);
      if (!extent) throw new Error("The model has zero size.");
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.scale.multiplyScalar(2 / extent);
      model.position.multiplyScalar(2 / extent);
      scene = new THREE.Scene();
      scene.background = new THREE.Color("#eef3fa");
      scene.add(model);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6c85, 2.6));
      const light = new THREE.DirectionalLight(0xffffff, 3.4);
      light.position.set(4, -3, 6);
      scene.add(light);
      const grid = new THREE.GridHelper(5, 20, 0xb5c8e2, 0xd7e1ee);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -dimensions.z / extent - 0.015;
      scene.add(grid);
      const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
      camera.up.set(0, 0, 1);
      camera.position.set(3.3, -4.3, 3.2);
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(
        thumbnail ? 1 : Math.min(window.devicePixelRatio, 2),
      );
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.current.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 0.5;
      controls.maxDistance = 15;
      controls.target.set(0, 0, 0);
      controls.update();
      controls.saveState();
      const resize = () => {
        const w = thumbnail ? 360 : host.current?.clientWidth || 300,
          h = thumbnail ? 300 : host.current?.clientHeight || 300;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(host.current);
      sceneRef.current = { renderer, scene, camera, controls };
      const animate = () => {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        if (!thumbnail) frame = requestAnimationFrame(animate);
      };
      animate();
      setLoaded(true);
      setReadyId(file.id);
      setStatus("");
      const facts = {
        dimensions: [dimensions.x, dimensions.y, dimensions.z],
        triangles: Math.round(triangles),
        meshes,
        embeddedNames,
        units: ["step", "stp", "iges", "igs"].includes(file.ext)
          ? "Millimeters, as imported from CAD"
          : "Model units; physical units not verified",
        validated: true,
      };
      callbackRef.current?.(facts, file.id, file.version);
      if (thumbnail)
        onReady?.(renderer.domElement.toDataURL("image/png"), facts);
    })().catch((e) => {
      if (!disposed) {
        setStatus(
          `Preview could not be loaded. ${e.message || "The file may use unsupported data."}`,
        );
        setLoaded(false);
        onError?.(e.message || "Unsupported model data.");
      }
    });
    return cleanup;
  }, [file?.id, file?.version]);
  return (
    <div className="preview-wrap" data-ready-file={readyId}>
      <div className="preview-canvas" ref={host} />
      {!loaded && (
        <div className="preview-message">
          {status === "Loading model…" ? (
            <LoaderCircle className="spin" size={32} />
          ) : (
            <Box size={34} />
          )}
          <p>{status}</p>
        </div>
      )}
      {loaded && (
        <>
          <button
            className="preview-reset icon-button"
            title="Reset view"
            onClick={() => sceneRef.current?.controls.reset()}
          >
            <RotateCcw size={16} />
          </button>
          <span className="preview-caption">
            Drag to orbit · Scroll to zoom
          </span>
        </>
      )}
    </div>
  );
});
