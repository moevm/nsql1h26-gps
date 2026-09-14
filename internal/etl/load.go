package etl

import (
	"context"
	"nosql/internal/domain"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

const (
	MERGE_H3_CELL = `
		MERGE (c:Cell{index: $cell}) 
		ON CREATE SET 
			c.resolution = 9
		`
	MERGE_POI = `
		MERGE (p:POI{id: $id})
		ON CREATE SET 
			p.name = $name, 
			p.type = $type,
			p.description = $description,
			p.tags = $tags, 
			p.lat = $lat, 
			p.lon = $lon
		ON MATCH SET 
			p.name = $name,
			p.description = $description
		`
	MERGE_CELL_CONTAINS_POI = `
		MERGE (c)-[:CONTAINS]->(p)
		`
	LOAD_POI_QUERY = "" +
		MERGE_H3_CELL +
		MERGE_POI +
		MERGE_CELL_CONTAINS_POI
)

func loadPOI(ctx context.Context, poi *domain.POI, driver neo4j.Driver) error {
	_, err := neo4j.ExecuteQuery(
		ctx,
		driver,
		LOAD_POI_QUERY,
		map[string]any{
			"id":          poi.ID,
			"name":        poi.Name,
			"type":        poi.Type,
			"description": poi.Description,
			"tags":        poi.Tags,
			"cell":        poi.Cell,
			"lat":         poi.Location.Lat,
			"lon":         poi.Location.Lon,
		},
		neo4j.EagerResultTransformer,
	)

	return err
}
