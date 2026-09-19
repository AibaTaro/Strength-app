// BodyParts3D(© Database Center for Life Science, CC BY-SA 2.1 JP)から使う部品を選ぶ。
// 筋肉=表層の主要な筋、骨=骨格全体(筋肉の隙間・関節が見えるため)。
export const RAW = "https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data";

const MUSCLES = [
  ["pec", /pectoralis major/],
  ["delt", /deltoid/],
  ["trap", /trapezius/],
  ["lat", /latissimus dorsi/],
  ["biceps", /biceps brachii/],
  ["triceps", /triceps brachii/],
  ["core", /rectus abdominis|external oblique/],
  ["glute", /gluteus (maximus|medius)/],
  ["quad", /rectus femoris|vastus (lateralis|medialis|intermedius)/],
  ["hamstring", /biceps femoris|semitendinosus|semimembranosus/],
  ["erector", /iliocostalis|longissimus thoracis|spinalis thoracis/],
  ["other", /serratus anterior|pectoralis minor|teres (major|minor)|infraspinatus|brachialis|brachioradialis|coracobrachialis|pronator teres|flexor carpi|palmaris|extensor carpi|extensor digitorum|extensor digiti minimi|flexor digitorum profundus|anconeus|supinator|tensor fasciae latae|sartorius|gracilis|adductor (longus|magnus|brevis)|pectineus|gastrocnemius|soleus|tibialis anterior|fibularis longus|extensor digitorum longus|sternocleidomastoid|splenius capitis|levator scapulae|temporalis|masseter|rhomboid major/],
];
const BONES = /bone$|^(right|left) (clavicle|scapula|humerus|radius|ulna|femur|tibia|fibula|patella)$|^(right|left) (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib$|vertebra$|^(sacrum|coccyx|mandible|atlas|axis|body of sternum|manubrium|xiphoid process)$|^(right|left) (metacarpal|proximal phalanx|middle phalanx|distal phalanx|metatarsal|talus|calcaneus|cuboid|navicular|cuneiform)/;

/** parts_list_e.txt と 存在するSTLのID集合から、使う部品 [{id, name, kind, group}] を返す */
export function selectParts(names, available) {
  const out = [];
  for (const [id, name] of Object.entries(names)) {
    if (!available.has(id)) continue;
    const n = name.toLowerCase();
    if (!/(right|left)/.test(n) && !/^(sacrum|coccyx|mandible|atlas|axis|body of sternum|manubrium|xiphoid process)$/.test(n) && !/vertebra$/.test(n)) continue;
    const m = MUSCLES.find(([, re]) => re.test(n));
    if (m) {
      let group = m[0];
      if (group === "delt") group = /clavicular/.test(n) ? "delt_front" : /acromial/.test(n) ? "delt_mid" : "delt_rear";
      if (group === "pec") group = /clavicular/.test(n) ? "upperpec" : "pec";
      out.push({ id, name, kind: "muscle", group });
    } else if (BONES.test(n) || /^(right|left) (cranial|frontal|parietal|occipital|temporal|sphenoid|ethmoid|zygomatic|maxilla|nasal|lacrimal|palatine)/.test(n)) {
      out.push({ id, name, kind: "bone", group: "bone" });
    }
  }
  return out;
}
