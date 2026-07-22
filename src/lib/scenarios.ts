// türkray — senaryoları Firestore'da sakla/yükle.
// Bir senaryo = { network, stock, route } (JSON olarak saklanır → Firestore
// iç içe dizi kısıtlarından etkilenmez). getDb() null ise (config yok) net hata.

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { RailNetwork, RollingStock, Route } from "./anaray/types";

const COL = "senaryolar";

export interface ScenarioData {
  network: RailNetwork;
  stock: RollingStock;
  route: Route;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  updatedAt: number | null;
}

function db() {
  const d = getDb();
  if (!d) throw new Error("Firebase yapılandırılmadı (.env.local eksik).");
  return d;
}

export async function saveScenario(name: string, data: ScenarioData): Promise<string> {
  const ref = await addDoc(collection(db(), COL), {
    name,
    payload: JSON.stringify(data),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listScenarios(): Promise<ScenarioMeta[]> {
  const snap = await getDocs(query(collection(db(), COL), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data() as { name?: string; updatedAt?: { toMillis?: () => number } };
    return {
      id: d.id,
      name: data.name ?? "(adsız)",
      updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null,
    };
  });
}

export async function loadScenario(id: string): Promise<ScenarioData> {
  const snap = await getDoc(doc(db(), COL, id));
  if (!snap.exists()) throw new Error("Senaryo bulunamadı.");
  return JSON.parse((snap.data() as { payload: string }).payload) as ScenarioData;
}

export async function deleteScenario(id: string): Promise<void> {
  await deleteDoc(doc(db(), COL, id));
}
