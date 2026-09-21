package etl

import (
	"nosql/internal/domain"

	"github.com/paulmach/osm"
	"github.com/uber/h3-go/v4"
)

func transformNode(n *osm.Node) (*domain.POI, error) {
	poi := &domain.POI{}
	poi.OsmID = uint64(n.ID)
	poi.Location = domain.Coordinate{Lat: n.Lat, Lon: n.Lon}

	tags, err := n.Tags.MarshalJSON()
	if err != nil {
		return nil, err
	}
	poi.Tags = string(tags)

	poi.Name = n.Tags.Find("name")
	if poi.Name == "" {
		poi.Name = "???"
	}
	// Выбор типа POI написан так для сохранения приоритетов, т.е более важный тег перезаписывает менее важный
	// TODO: переписать на динамический выбор
	if t := n.Tags.Find("railway"); t != "" {
		poi.Type = t
	}
	if t := n.Tags.Find("amenity"); t != "" {
		poi.Type = t
	}
	if t := n.Tags.Find("tourism"); t != "" {
		poi.Type = t
	}
	if t := n.Tags.Find("historic"); t != "" {
		poi.Type = t
	}

	h3LatLon := h3.NewLatLng(n.Lat, n.Lon)
	cell, err := h3.LatLngToCell(h3LatLon, 9)
	if err != nil {
		return nil, err
	}
	poi.Cell = cell

	return poi, nil
}
