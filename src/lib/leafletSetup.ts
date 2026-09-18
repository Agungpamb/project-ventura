import L from 'leaflet';

// Safeguard against Leaflet's well-known "Cannot read properties of undefined (reading '_leaflet_pos')" error
// which happens during React StrictMode unmount/remount, rapid pan/zoom, or layer transitions.

if (typeof window !== 'undefined' && L) {
  // 1. Guard L.DomUtil.getPosition
  if (L.DomUtil) {
    const originalGetPosition = L.DomUtil.getPosition;
    L.DomUtil.getPosition = function (el: any): L.Point {
      if (!el) {
        return new L.Point(0, 0);
      }
      try {
        if (originalGetPosition) {
          const pos = originalGetPosition.call(L.DomUtil, el);
          return pos || new L.Point(0, 0);
        }
        return el._leaflet_pos || new L.Point(0, 0);
      } catch {
        return new L.Point(0, 0);
      }
    };
  }

  // 2. Guard L.PosAnimation.prototype.run
  if (L.PosAnimation && L.PosAnimation.prototype) {
    const originalPosAnimRun = L.PosAnimation.prototype.run;
    L.PosAnimation.prototype.run = function (el: any, newPos: any, duration?: any, easeLinearity?: any) {
      if (!el) {
        return this;
      }
      try {
        return originalPosAnimRun.call(this, el, newPos, duration, easeLinearity);
      } catch (err) {
        console.warn('Safely prevented Leaflet PosAnimation error:', err);
        return this;
      }
    };
  }

  // 3. Guard L.Map.prototype._getMapPanePos
  if (L.Map && L.Map.prototype) {
    const origGetMapPanePos = (L.Map.prototype as any)._getMapPanePos;
    if (origGetMapPanePos) {
      (L.Map.prototype as any)._getMapPanePos = function (): L.Point {
        if (!this._mapPane) {
          return new L.Point(0, 0);
        }
        try {
          return origGetMapPanePos.call(this) || new L.Point(0, 0);
        } catch {
          return new L.Point(0, 0);
        }
      };
    }

    // 4. Guard L.Map.prototype.remove to gracefully stop animations
    const origRemove = L.Map.prototype.remove;
    if (origRemove) {
      L.Map.prototype.remove = function () {
        try {
          if ((this as any)._panAnim) {
            (this as any)._panAnim.stop();
          }
          this.stop();
        } catch {}
        try {
          return origRemove.call(this);
        } catch (err) {
          console.warn('Safely prevented Leaflet Map.remove error:', err);
          return this;
        }
      };
    }
  }

  // 5. Guard L.Popup.prototype._adjustPan
  if (L.Popup && L.Popup.prototype) {
    const origAdjustPan = (L.Popup.prototype as any)._adjustPan;
    if (origAdjustPan) {
      (L.Popup.prototype as any)._adjustPan = function () {
        if (!this._container || !this._map || !(this._map as any)._mapPane) {
          return;
        }
        try {
          return origAdjustPan.call(this);
        } catch (err) {
          console.warn('Safely prevented Leaflet Popup._adjustPan error:', err);
        }
      };
    }
  }
}

export default L;
