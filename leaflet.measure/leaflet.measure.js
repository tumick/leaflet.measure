L.Control.Measure = L.Control.extend({

	options: {
		position: 'topleft',
		cursor: 'crosshair',
		stopKey: 'Escape',
		button: undefined,
		formatDistance: null,
		markerOptions: {
			color: 'black',
			opacity: 1,
			weight: 1,
			fill: true,
			fillOpacity: 1,
			radius: 2
		},
		lineOptions: {
			color: 'black',
			weight: 2,

		},
		rayOptions: {
			weight: 1.5,
			dashArray: '6,3',
		}
	},

	onAdd: function (map) {
		const className = 'leaflet-control-zoom leaflet-bar leaflet-control';
		const container = L.DomUtil.create('div', className);

		if (this.options.button !== null) {
			this._connectButton(this.options.button || this._createButton('&#8674;','Measure', container), this);
		}

		this._lineOptions = Object.assign(this.options.lineOptions, { clickable: false, interactive: false })
		this._rayOptions = Object.assign(this._lineOptions, this.options.rayOptions);

		return container;
	},

	_createButton: function (html, title, container) {
		const link = L.DomUtil.create('a', null, container);
		link.innerHTML = html;
		link.href = '#';
		link.title = title;
		return link;
	},

	_connectButton: function (button, context) {
		L.DomEvent
			.on(button, 'click', L.DomEvent.stopPropagation)
			.on(button, 'click', L.DomEvent.preventDefault)
			.on(button, 'click', this._toggleMeasure, context)
			.on(button, 'dblclick', L.DomEvent.stopPropagation);
		L.DomUtil.addClass(button, 'leaflet-control-measure leaflet-bar-part leaflet-bar-part-top-and-bottom');

		return button;
	},

	_toggleMeasure: function () {
		this._measuring = !this._measuring;

		if (this._measuring) {
			L.DomUtil.addClass(this._container, 'leaflet-control-measure-on');
			this._startMeasuring();
		} else {
			L.DomUtil.removeClass(this._container, 'leaflet-control-measure-on');
			this._stopMeasuring();
		}
	},

	_startMeasuring: function() {
    this._map.fire('start_measuring');
		this._oldCursor = this._map._container.style.cursor;
		this._map._container.style.cursor = this.options.cursor;

		this._doubleClickZoom = this._map.doubleClickZoom.enabled();
		this._map.doubleClickZoom.disable();

		this._isRestarted = false;

		L.DomEvent
			.on(this._map, 'mousemove', this._mouseMove, this)
			.on(this._map, 'click', this._mouseClick, this)
			.on(this._map, 'dblclick', this._finishPath, this)
			.on(document, 'keydown', this._onKeyDown, this);

		if (!this._layerPaint) {
			this._layerPaint = L.layerGroup().addTo(this._map);
		}

		if (!this._points) {
			this._points = [];
		}
	},

	_stopMeasuring: function() {
		this._map._container.style.cursor = this._oldCursor;

		L.DomEvent
			.off(this._map, 'mousemove', this._mouseMove, this)
			.off(this._map, 'click', this._mouseClick, this)
			.off(this._map, 'dblclick', this._mouseClick, this)
			.off(document, 'keydown', this._onKeyDown, this);

		this._doubleClickZoom && this._map.doubleClickZoom.enable();

		this._layerPaint && this._layerPaint.clearLayers();

		this._restartPath();
    this._map.fire('stop_measuring');
	},

	_mouseMove: function(e) {
		if (!e.latlng || !this._lastPoint) {
			return;
		}

		if (!this._layerPaintPathTemp) {
			this._layerPaintPathTemp = L.polyline([this._lastPoint, e.latlng], this._rayOptions)
				.addTo(this._layerPaint);
		} else {
			const latLngs = this._layerPaintPathTemp.getLatLngs();
      latLngs.splice(0, 2, this._lastPoint, e.latlng);
			this._layerPaintPathTemp.setLatLngs(latLngs);
		}

		if (this._tooltip) {
			if (!this._distance) {
				this._distance = 0;
			}

			this._updateTooltipPosition(e.latlng);

			const distance = e.latlng.distanceTo(this._lastPoint);

			this._updateTooltipDistance(this._distance + distance, distance);
		}
	},

	_finishPath: function() {
		// Remove the last end marker as well as the last (moving tooltip)
		this._lastCircle && this._layerPaint.removeLayer(this._lastCircle);
		this._tooltip && this._layerPaint.removeLayer(this._tooltip);
		this._layerPaint && this._layerPaintPathTemp && this._layerPaint.removeLayer(this._layerPaintPathTemp);

		// Reset everything
		this._restartPath();
	},

	_mouseClick: function(e) {
		// Skip if no coordinates
		if (!e.latlng) {
			return;
		}

		if (this._isRestarted) {
			this._isRestarted = false;
			return;
		}

		// If we have a tooltip, update the distance and create a new tooltip, leaving the old one exactly where it is (i.e. where the user has clicked)
		if (this._lastPoint && this._tooltip) {
			if (!this._distance) {
				this._distance = 0;
			}

			this._updateTooltipPosition(e.latlng);

			const distance = e.latlng.distanceTo(this._lastPoint);
			this._updateTooltipDistance(this._distance + distance, distance);

			this._distance += distance;
		}
		this._createTooltip(e.latlng);

		// If this is already the second click, add the location to the fix path (create one first if we don't have one)
		if (this._lastPoint && !this._layerPaintPath) {
			this._layerPaintPath = L.polyline([this._lastPoint], this._lineOptions).addTo(this._layerPaint);
		}

		if (this._layerPaintPath) {
			this._layerPaintPath.addLatLng(e.latlng);
		}

		// Update the end marker to the current location
		if (this._lastCircle) {
			this._layerPaint.removeLayer(this._lastCircle);
		}

		this._lastCircle = new L.CircleMarker(e.latlng,
			Object.assign(this.options.markerOptions, { clickable: Boolean(this._lastCircle) })
			)
			.addTo(this._layerPaint)
			.on('click', this._finishPath, this);

		// Save current location as last location
		this._lastPoint = e.latlng;
	},

	_restartPath: function() {
		this._distance = 0;
		this._tooltip = undefined;
		this._lastCircle = undefined;
		this._lastPoint = undefined;
		this._layerPaintPath = undefined;
		this._layerPaintPathTemp = undefined;

		//  flag to stop propagation events...
		this._isRestarted = true;
	},

	_createTooltip: function(position) {
		const icon = L.divIcon({
			className: 'leaflet-measure-tooltip',
			iconAnchor: [-5, -5]
		});
		this._tooltip = L.marker(position, {
			icon: icon,
			clickable: false
		}).addTo(this._layerPaint);
	},

	_updateTooltipPosition: function(position) {
		this._tooltip.setLatLng(position);
	},

	_updateTooltipDistance: function(total, difference) {
		const totalRound = this._formatDistance(total);
		const differenceRound = this._formatDistance(difference);

		let text = `<div class="leaflet-measure-tooltip-total">${totalRound}</div>`;
		if (totalRound !== differenceRound) {
			text += `<div class="leaflet-measure-tooltip-difference">${differenceRound}</div>`;
		}

		this._tooltip._icon.innerHTML = text;
	},

	_formatDistance: function (val) {
		if (this.options.formatDistance instanceof Function) {
			return this.options.formatDistance(val);
		}
		return Math.round(val) + 'm';
	},

	_onKeyDown: function (e) {
		if (e.key === this.options.stopKey) {
			if (this._lastPoint) {
				this._finishPath();
				this._isRestarted = false;
			} else {
				this._toggleMeasure();
			}
		}
	}
});

L.Map.mergeOptions({
	measureControl: false
});

L.Map.addInitHook(function () {
	if (this.options.measureControl) {
		this.measureControl = new L.Control.Measure(
			this.options.measureControl instanceof Object ? this.options.measureControl : undefined
		);
		this.addControl(this.measureControl);
	}
});

L.control.measure = function (options) {
	return new L.Control.Measure(options);
};
