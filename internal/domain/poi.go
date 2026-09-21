package domain

import "github.com/uber/h3-go/v4"

type POI struct {
	OsmID       uint64     `json:"osmId"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Description string     `json:"description"`
	Tags        string     `json:"tags"`
	Cell        h3.Cell    `json:"cell"`
	Location    Coordinate `json:"location"`
}
