package etl

import (
	"github.com/paulmach/osm"
)

func filterNode(node *osm.Node) bool {
	for _, tag := range node.Tags {
		switch tag.Key {
		case "historic":
			switch tag.Value {
			case "monument", "castle", "ruins":
				return true
			}
		case "tourism":
			switch tag.Value {
			case "viewpoint", "attraction", "artwork", "museum":
				return true
			}
		case "amenity":
			switch tag.Value {
			case "fountain", "place_of_worship", "theatre", "cinema",
				"arts_centre", "planetarium", "clock", "library", "townhall", "university":
				return true
			}
		case "railway":
			if tag.Value == "station" {
				return true
			}
		}
	}
	return false
}
