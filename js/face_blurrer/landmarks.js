// MediaPipe Face Mesh landmark indices
// Source: https://github.com/k-mediapipe/face_mesh

// Eye landmark indices
const LEFT_EYE_INDICES = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const RIGHT_EYE_INDICES = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];

// Feature landmark indices
// Note: MediaPipe Face Mesh indices are viewer-relative (left/right mirror the subject's perspective)
const LEFT_BROW_INDICES = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_BROW_INDICES = [300,293,334,296,336,285,295,282,283,276];
const NOSE_INDICES = [1,2,4,5,6,64,168,197,294];
const MOUTH_INDICES = [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78,191,80,81,82,13,312,311,310,415,267,269,270,409,185,40,39,37,0,183,42];

// Face oval landmarks for visualization
const FACE_OVAL_INDICES = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
