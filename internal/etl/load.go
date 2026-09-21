package etl

import (
	"context"
	"errors"
	"fmt"
	"nosql/internal/domain"
	"time"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

const (
	BATCH_SIZE    = 1000
	LOAD_INTERVAL = time.Millisecond * 300

	BATCH_LOAD_POIS = `
		MERGE (c:IdCounter { label: 'POI' }) ON CREATE SET c.value = 1000
		WITH c
		UNWIND $batch AS item
		MERGE (p:POI { osm_id: item.osmId })
		ON CREATE SET
			p.name = item.name,
			p.type = item.type,
			p.description = item.description,
			p.tags = item.tags,
			p.note = null,
			p.location = point({ latitude: item.lat, longitude: item.lon }),
			p.created_at = datetime(),
			p.updated_at = datetime()
		ON MATCH SET
			p.name = item.name,
			p.type = item.type,
			p.description = item.description,
			p.tags = item.tags,
			p.location = point({ latitude: item.lat, longitude: item.lon }),
			p.updated_at = datetime()
		WITH p, item
		WHERE p.id IS NULL
		// инкремент счётчика — в CALL-сабзапросе НА СТРОКУ: обычный UNWIND+SET
		// не чейнит обновления (все строки читают одно значение — проверено)
		CALL (item) {
			MATCH (c:IdCounter { label: 'POI' })
			SET c.value = c.value + 1
			RETURN c.value AS newId
		}
		SET p.id = newId
	`

	BATCH_LOAD_CELLS = `
		UNWIND $batch AS item
		MATCH (p:POI { osm_id: item.osmId })
		MERGE (cell:CELL { index: item.cellIndex })
		ON CREATE SET cell.resolution = 9
		MERGE (cell)-[:CONTAINS]->(p)
	`
)

func toBatchItem(poi *domain.POI) map[string]any {
	return map[string]any{
		"osmId":       poi.OsmID,
		"name":        poi.Name,
		"type":        poi.Type,
		"description": poi.Description,
		"tags":        poi.Tags,
		"lat":         poi.Location.Lat,
		"lon":         poi.Location.Lon,
		"cellIndex":   poi.Cell.String(),
	}
}

func loadBatch(ctx context.Context, session neo4j.Session, pois []*domain.POI) error {
	if len(pois) == 0 {
		return nil
	}

	batch := make([]map[string]any, len(pois))
	for i, poi := range pois {
		batch[i] = toBatchItem(poi)
	}

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, query := range []string{BATCH_LOAD_POIS, BATCH_LOAD_CELLS} {
			result, err := tx.Run(ctx, query, map[string]any{"batch": batch})
			if err != nil {
				return nil, err
			}
			if _, err := result.Consume(ctx); err != nil {
				return nil, err
			}
		}
		return nil, nil
	})

	return err
}

func loadPOIS(ctx context.Context, driver neo4j.Driver, chanPois <-chan *domain.POI) error {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	pois := make([]*domain.POI, 0, BATCH_SIZE)

	ticker := time.NewTicker(LOAD_INTERVAL)
	defer ticker.Stop()

	var lastErr error

	flush := func() {
		if err := loadBatch(ctx, session, pois); err != nil {
			fmt.Printf("Error loading batch: %v\n", err)
			lastErr = err
		}
		pois = pois[:0]
	}

	for {
		select {
		case <-ctx.Done():
			return errors.Join(lastErr, ctx.Err())
		case <-ticker.C:
			flush()
		case poi, ok := <-chanPois:
			if !ok {
				if err := loadBatch(ctx, session, pois); err != nil {
					return errors.Join(lastErr, err)
				}
				return lastErr
			}

			pois = append(pois, poi)

			if len(pois) >= BATCH_SIZE {
				flush()
				ticker.Reset(LOAD_INTERVAL)
			}
		}
	}
}
