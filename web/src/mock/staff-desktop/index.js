// Bộ dữ liệu giả của màn nhân viên trên máy tính, chọn theo kịch bản ?kb=
import { LINH } from './scenario-linh.js';
import { CA_DEM, CTV, TTS } from './scenarios-a.js';
import { QUEN_CHECKOUT, YEU_CAU_CHO } from './scenarios-b.js';

export const SCENARIOS = {
  linh: LINH,
  'ca-dem': CA_DEM,
  ctv: CTV,
  tts: TTS,
  'quen-checkout': QUEN_CHECKOUT,
  'yeu-cau-cho': YEU_CAU_CHO
};
export const DEFAULT_KB = 'linh';
