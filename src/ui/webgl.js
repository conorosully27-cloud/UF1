// Whether this browser can draw 3D (WebGL): the Car tab's car and the race in
// 3D fall back to flat drawings where it cannot.
export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
